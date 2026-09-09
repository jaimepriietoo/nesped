-- Fase 4: medir antes de decidir, y un desperdicio que la medición encontró.
-- Aplicado en producción el 2026-09-09.
--
-- La hoja de ruta decía "particionar", "réplicas de lectura" y "repartir por
-- fragmentos" para cuando haya entre 50.000 y 200.000 empresas. Eso no es un
-- plan: es una lista de deseos con un número al lado que nadie sabe medir. Un
-- plan así se cumple tarde o pronto, y las dos son caras. Pronto es complicar
-- un producto de cinco clientes con particiones que no hacen nada. Tarde es
-- descubrir que hacía falta particionar el día que la tabla tiene cien
-- millones de filas y ya no se puede sin parar el servicio.
--
-- Los números medidos están en docs/hasta-donde-aguanta.md.

-- ── 1. Los números que dicen cuándo tirar de cada palanca ─────────────────

-- stats_reset es null cuando nunca se han reiniciado las estadísticas. Eso no
-- quiere decir "no se sabe": quiere decir que se lleva contando desde que
-- arrancó el servidor. Sin este coalesce, el aviso de índices sin usar no
-- saltaría nunca, porque la comparación contra null siempre es falsa.
create or replace function public.desde_cuando_se_mide()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select stats_reset from pg_stat_database where datname = current_database()),
    pg_postmaster_start_time()
  );
$$;

revoke all on function public.desde_cuando_se_mide() from public, anon, authenticated;
grant execute on function public.desde_cuando_se_mide() to service_role;

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
  v_desde           timestamptz;
  v_dias_medidos    numeric;
begin
  select setting::integer into v_max_conexiones from pg_settings where name = 'max_connections';
  select count(*) into v_conexiones from pg_stat_activity;

  v_desde := public.desde_cuando_se_mide();
  v_dias_medidos := round(extract(epoch from (now() - v_desde)) / 86400.0, 1);

  -- Cuántas lecturas se sirven de memoria. Cuando esto baja, manda el disco y
  -- todo se nota lento a la vez.
  select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
    into v_acierto
    from pg_stat_database where datname = current_database();

  -- Se usa la estimación del planificador y no un count: contar cien millones
  -- de filas para saber si hay cien millones de filas es lo que se evita.
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

  -- Índices que nadie usa. Cada uno cuesta en CADA escritura, para siempre, y
  -- no ahorra ni una lectura. Se ignoran los de clave única: están para
  -- garantizar algo, no para ir rápido.
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
      'palanca', 'Aquí sí toca particionar por fecha. Antes de esto, particionar cuesta la clave ajena de alerts a calls y no ahorra nada.'
    );
  end if;

  if (v_cola->>'espera_maxima_minutos')::numeric > 30 then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'La cola no da abasto',
      'medido',  (v_cola->>'espera_maxima_minutos') || ' minutos esperando',
      'palanca', 'Más trabajadores, o ejecutar los trabajos fuera de las funciones de Vercel. Ver lib/server/latido-cola.cjs.'
    );
  end if;

  -- Un índice con cero usos NO es un índice inútil.
  --
  -- Puede ser que nadie lo haya necesitado todavía. idx_calls_call_sid lo usa
  -- el servidor de voz para encontrar una llamada por su identificador, y sale
  -- con cero usos por el motivo más simple: no hay número de teléfono
  -- contratado y no ha entrado ninguna llamada. Borrarlo por esa lectura sería
  -- quitar justamente el índice que hará falta el día uno.
  --
  -- Con menos de una semana de historial se enseña el dato pero no se
  -- aconseja nada.
  if jsonb_array_length(v_indices_ociosos) > 0 and v_dias_medidos >= 7 then
    v_avisos := v_avisos || jsonb_build_object(
      'que',     'Hay índices que nadie ha usado en ' || v_dias_medidos || ' días',
      'medido',  jsonb_array_length(v_indices_ociosos) || ' índices',
      'palanca', 'Mirar uno por uno antes de borrar: un índice sin usar cuesta en cada escritura, pero cero usos también puede querer decir que esa función del producto aún no se usa.'
    );
  end if;

  return jsonb_build_object(
    'medido_en',       now(),
    'contando_desde',  v_desde,
    'dias_medidos',    v_dias_medidos,
    'tamano_base',     pg_size_pretty(pg_database_size(current_database())),
    'conexiones',      jsonb_build_object('ahora', v_conexiones, 'maximo', v_max_conexiones),
    'acierto_cache',   v_acierto,
    'tablas',          v_tablas,
    'indices_sin_usar', jsonb_build_object(
      'lista',  v_indices_ociosos,
      'fiable', v_dias_medidos >= 7,
      'nota',   case when v_dias_medidos >= 7
                  then 'Hay historial suficiente para mirárselo.'
                  else 'Pronto para hacerle caso: se lleva midiendo ' || v_dias_medidos ||
                       ' días y un índice sin usar puede ser sólo una función del producto que aún no se usa.'
                end
    ),
    'cola',            v_cola,
    'avisos',          v_avisos,
    -- Sin avisos no hay nada que hacer hoy. Es la respuesta más frecuente, y
    -- decirlo evita que alguien se invente trabajo.
    'hay_que_hacer_algo', jsonb_array_length(v_avisos) > 0
  );
end;
$$;

revoke all on function public.salud_de_la_base() from public, anon, authenticated;
grant execute on function public.salud_de_la_base() to service_role;

-- ── 2. Los totales globales, sólo en la primera página ────────────────────
--
-- Se calculaban en CADA página del panel de administración. Medido con 506
-- empresas y 45.000 llamadas: una página costaba 13,5 ms y 7,4 de ellos eran
-- volver a contar exactamente lo mismo. Más de la mitad del trabajo.
--
-- Y esa proporción empeora: el coste de una página no cambia —siempre son cien
-- empresas— pero contar todas las llamadas de la plataforma crece con la
-- plataforma. A 200.000 empresas, paginar el panel entero habría contado la
-- tabla de llamadas dos mil veces seguidas.
--
-- Página siguiente: 13,5 ms → 3,0 ms.

create or replace function public.resumen_de_empresas(
  p_limite  integer default 100,
  p_desde   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite    integer := least(greatest(coalesce(p_limite, 100), 1), 500);
  v_empresas  jsonb;
  v_siguiente text;
  v_totales   jsonb;
begin
  with pagina as (
    select c.id, c.name, c.plan, c.status
    from clients c
    where p_desde is null or c.id > p_desde
    order by c.id
    limit v_limite
  ),
  contadas as (
    select p.id, p.name, p.plan, p.status,
           coalesce(l.n, 0) as total_calls,
           coalesce(d.n, 0) as total_leads,
           coalesce(u.n, 0) as users
    from pagina p
    left join lateral (select count(*) n from calls        where client_id = p.id) l on true
    left join lateral (select count(*) n from leads        where client_id = p.id) d on true
    left join lateral (select count(*) n from portal_users where client_id = p.id) u on true
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'client_id', id, 'client_name', name, 'plan', plan, 'status', status,
        'total_calls', total_calls, 'total_leads', total_leads, 'users', users,
        'conversion', case when total_calls > 0
                        then round((total_leads::numeric / total_calls) * 100, 1)
                        else 0 end
      ) order by id
    ), '[]'::jsonb),
    max(id)
  into v_empresas, v_siguiente
  from contadas;

  -- Sólo en la primera página. Las siguientes devuelven null y quien pagina se
  -- queda con los que ya tenía.
  if p_desde is null then
    select jsonb_build_object(
      'totalClients', (select count(*) from clients),
      'totalUsers',   (select count(*) from portal_users),
      'totalCalls',   public.cuenta_o_estima('calls'),
      'totalLeads',   public.cuenta_o_estima('leads'),
      'exactas',      (select coalesce(max(reltuples), 0) < 500000
                       from pg_class where relname in ('calls','leads'))
    ) into v_totales;
  end if;

  return jsonb_build_object(
    'clients', v_empresas,
    'metrics', v_totales,
    'cursor',  case when jsonb_array_length(v_empresas) < v_limite
                 then null else v_siguiente end
  );
end;
$$;

revoke all on function public.resumen_de_empresas(integer, text) from public, anon, authenticated;
grant execute on function public.resumen_de_empresas(integer, text) to service_role;
