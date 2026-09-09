-- Los números que dicen cuándo hay que tirar de cada palanca.
--
-- La hoja de ruta de la auditoría decía "particionar", "réplicas de lectura" y
-- "repartir por fragmentos" para cuando haya entre 50.000 y 200.000 empresas.
-- Eso no es un plan: es una lista de deseos con un número al lado que nadie
-- sabe medir. Hoy hay cinco empresas y la base de datos ocupa 13 MB.
--
-- El problema de un plan así es que se cumple tarde o pronto, y las dos son
-- caras. Pronto es complicar un producto de cinco clientes con particiones y
-- fragmentos que no hacen nada. Tarde es descubrir que hace falta particionar
-- el día que la tabla tiene cien millones de filas y ya no se puede hacer sin
-- parar el servicio.
--
-- Esto mide las cosas que de verdad deciden, cada una con su umbral y con la
-- palanca que hay que tocar cuando se pasa. Así la decisión deja de depender
-- de la intuición de quien mire ese día.
--
-- Los umbrales están puestos con margen, para que salte el aviso mientras
-- todavía se puede hacer el cambio con calma.
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

  -- Cuántas lecturas se sirven de memoria. Cuando esto baja, el disco empieza
  -- a mandar y todo se nota lento a la vez.
  select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
    into v_acierto
    from pg_stat_database where datname = current_database();

  -- Las tablas por tamaño, con las filas que estima el planificador. Se usa la
  -- estimación y no un count: contar cien millones de filas para saber si hay
  -- cien millones de filas es justo lo que se quiere evitar.
  select coalesce(jsonb_agg(t order by t->>'bytes' desc), '[]'::jsonb) into v_tablas
  from (
    select jsonb_build_object(
      'tabla',   c.relname,
      'filas',   greatest(c.reltuples, 0)::bigint,
      'bytes',   pg_total_relation_size(c.oid),
      'tamano',  pg_size_pretty(pg_total_relation_size(c.oid)),
      'indices', pg_size_pretty(pg_indexes_size(c.oid))
    ) as t
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and pg_total_relation_size(c.oid) > 0
    order by pg_total_relation_size(c.oid) desc
    limit 12
  ) x;

  -- Índices que nadie usa. Cada uno cuesta en CADA escritura, para siempre, y
  -- no ahorra ni una lectura. Se ignoran los pequeños y los de clave única,
  -- que están para garantizar algo, no para ir rápido.
  select coalesce(jsonb_agg(jsonb_build_object(
           'indice', indexrelname,
           'tabla',  relname,
           'tamano', pg_size_pretty(pg_relation_size(indexrelid))
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
    -- Lo que lleva más tiempo esperando. Si esto crece, la cola no da abasto.
    'espera_maxima_minutos',
      coalesce(round(extract(epoch from (now() - min(creado_en)))/60)
               filter (where estado = 'pendiente'), 0)
  ) into v_cola
  from public.trabajos;

  -- ── Los avisos, cada uno con su palanca ────────────────────────────────

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
    -- Sin avisos no hay nada que hacer hoy. Es una respuesta legítima y la
    -- más frecuente; decirlo evita que alguien se invente trabajo.
    'hay_que_hacer_algo', jsonb_array_length(v_avisos) > 0
  );
end;
$$;

revoke all on function public.salud_de_la_base() from public, anon, authenticated;
grant execute on function public.salud_de_la_base() to service_role;;
