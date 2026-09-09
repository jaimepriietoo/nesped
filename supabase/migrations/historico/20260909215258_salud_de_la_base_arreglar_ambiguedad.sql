-- pg_stat_user_indexes y pg_index tienen las dos una columna indexrelid, así
-- que sin cualificar no se sabe de cuál se habla.
create or replace function public.salud_de_la_base()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_max_conexiones  integer;
  v_conexiones      integer;
  v_acierto         numeric;
  v_tablas          jsonb;
  v_indices_ociosos jsonb;
  v_cola            jsonb;
  v_avisos          jsonb := '[]'::jsonb;
begin
  select setting::integer into v_max_conexiones from pg_settings where name = 'max_connections';
  select count(*) into v_conexiones from pg_stat_activity;

  select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
    into v_acierto
    from pg_stat_database where datname = current_database();

  select coalesce(jsonb_agg(t.dato order by t.peso desc), '[]'::jsonb) into v_tablas
  from (
    select pg_total_relation_size(c.oid) as peso,
           jsonb_build_object(
             'tabla',   c.relname,
             'filas',   greatest(c.reltuples, 0)::bigint,
             'tamano',  pg_size_pretty(pg_total_relation_size(c.oid)),
             'indices', pg_size_pretty(pg_indexes_size(c.oid))
           ) as dato
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and pg_total_relation_size(c.oid) > 0
    order by pg_total_relation_size(c.oid) desc
    limit 12
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'indice', s.indexrelname,
           'tabla',  s.relname,
           'tamano', pg_size_pretty(pg_relation_size(s.indexrelid))
         )), '[]'::jsonb)
    into v_indices_ociosos
  from pg_stat_user_indexes s
  join pg_index i on i.indexrelid = s.indexrelid
  where s.schemaname = 'public'
    and s.idx_scan = 0
    and not i.indisunique
    and not i.indisprimary
    and pg_relation_size(s.indexrelid) > 1024 * 1024;

  select jsonb_build_object(
    'pendientes', count(*) filter (where estado = 'pendiente'),
    'en_curso',   count(*) filter (where estado = 'en_curso'),
    'fallidos',   count(*) filter (where estado = 'fallido'),
    'espera_maxima_minutos',
      coalesce(round(extract(epoch from (now() - min(creado_en) filter (where estado = 'pendiente')))/60), 0)
  ) into v_cola
  from public.trabajos;

  if v_conexiones::numeric / nullif(v_max_conexiones, 0) > 0.7 then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'Conexiones al límite',
      'medido',  v_conexiones || ' de ' || v_max_conexiones,
      'palanca', 'Subir el plan de Supabase o poner un pool delante. Es la primera pared que se toca al crecer, y llega antes que ninguna de las de la hoja de ruta.'
    );
  end if;

  if v_acierto < 95 then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'Las lecturas ya no caben en memoria',
      'medido',  v_acierto || '% de acierto',
      'palanca', 'Más RAM primero, que es un botón. Réplica de lectura sólo si con más RAM sigue bajo: una réplica no arregla que los índices no quepan, los duplica.'
    );
  end if;

  if exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.reltuples > 50000000
  ) then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'Una tabla pasa de cincuenta millones de filas',
      'medido',  (select string_agg(c.relname, ', ') from pg_class c
                  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                    and c.reltuples > 50000000),
      'palanca', 'Aquí sí toca particionar por fecha. Antes de esto, particionar cuesta una clave ajena y no ahorra nada.'
    );
  end if;

  if (v_cola->>'espera_maxima_minutos')::numeric > 30 then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'La cola no da abasto',
      'medido',  (v_cola->>'espera_maxima_minutos') || ' minutos esperando',
      'palanca', 'Más trabajadores, o ejecutar los trabajos fuera de las funciones de Vercel. Ver lib/server/latido-cola.cjs.'
    );
  end if;

  if jsonb_array_length(v_indices_ociosos) > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'Hay índices que nadie usa',
      'medido',  jsonb_array_length(v_indices_ociosos) || ' índices',
      'palanca', 'Borrarlos. Cuestan en cada escritura y no ahorran ninguna lectura.'
    );
  end if;

  return jsonb_build_object(
    'medido_en',      now(),
    'tamano_base',    pg_size_pretty(pg_database_size(current_database())),
    'conexiones',     jsonb_build_object('ahora', v_conexiones, 'maximo', v_max_conexiones),
    'acierto_cache',  v_acierto,
    'tablas',         v_tablas,
    'indices_ociosos', v_indices_ociosos,
    'cola',           v_cola,
    'avisos',         v_avisos,
    'hay_que_hacer_algo', jsonb_array_length(v_avisos) > 0
  );
end;
$$;

revoke all on function public.salud_de_la_base() from public, anon, authenticated;
grant execute on function public.salud_de_la_base() to service_role;;
