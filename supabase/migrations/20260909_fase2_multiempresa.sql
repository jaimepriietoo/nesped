-- Fase 2 de la auditoría: que ninguna empresa dependa del tamaño de otra.
-- Aplicado en producción el 2026-09-09.
--
-- A diferencia de las fases 0 y 1, aquí va el SQL entero y no sólo la nota.
-- Los ficheros anteriores remiten a las migraciones guardadas dentro de
-- Supabase, y eso significa que este repositorio NO puede reconstruir el
-- esquema: si mañana hiciera falta un segundo entorno, o hubiera que
-- recuperar el proyecto, la forma de la base de datos sólo existe en un sitio.
-- Está anotado como pendiente; a partir de aquí no se agranda.
--
-- Cuatro cosas:
--
--   1. resumen_de_empresas / resumen_global. El panel de administración
--      contaba en JavaScript: pedía TODAS las llamadas y TODOS los contactos
--      de TODAS las empresas y luego, por cada una, recorría los arrays
--      enteros. Es cuadrático, y las llamadas llevan la transcripción entera.
--   2. resumen_de_informe. Los informes por correo se sacaban trayéndose la
--      cartera completa de la empresa a memoria.
--   3. trabajos. Una cola: lo que no cabe en una petición deja de intentar
--      caber. Antes, si Vercel cortaba la función, el informe se perdía sin
--      reintento y sin rastro.
--   4. cuenta_o_estima. Contar exacto mientras se pueda, estimar cuando
--      contar salga caro, y decir cuál de las dos cosas se está haciendo.

-- ── Cifras agregadas ──────────────────────────────────────────────────────

create or replace function public.cuenta_o_estima(p_tabla text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimadas bigint;
  v_exactas   bigint;
begin
  select coalesce(reltuples, 0)::bigint into v_estimadas
  from pg_class where relname = p_tabla and relnamespace = 'public'::regnamespace;

  -- reltuples vale -1 en una tabla que nunca se ha analizado.
  if v_estimadas is null or v_estimadas < 0 or v_estimadas < 500000 then
    execute format('select count(*) from public.%I', p_tabla) into v_exactas;
    return v_exactas;
  end if;

  return v_estimadas;
end;
$$;

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
  -- Ordenadas por id para que el cursor sea estable: con `offset`, crear una
  -- empresa mientras se pagina salta o repite filas.
  with pagina as (
    select c.id, c.name, c.plan, c.status
    from clients c
    where p_desde is null or c.id > p_desde
    order by c.id
    limit v_limite
  ),
  -- El lateral agrega SOLO las empresas de esta página. Sin él, un group by
  -- recorrería las llamadas de todas para devolver cien.
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

  select jsonb_build_object(
    'totalClients', (select count(*) from clients),
    'totalUsers',   (select count(*) from portal_users),
    'totalCalls',   public.cuenta_o_estima('calls'),
    'totalLeads',   public.cuenta_o_estima('leads'),
    'exactas',      (select coalesce(max(reltuples), 0) < 500000
                     from pg_class where relname in ('calls','leads'))
  ) into v_totales;

  return jsonb_build_object(
    'clients', v_empresas,
    'metrics', v_totales,
    'cursor',  case when jsonb_array_length(v_empresas) < v_limite
                 then null else v_siguiente end
  );
end;
$$;

create or replace function public.resumen_global()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with c as (
    select count(*)::bigint                               as total,
           coalesce(round(avg(duration_seconds)), 0)::int as media_duracion
    from calls
  ),
  l as (
    select count(*)::bigint                          as total,
           coalesce(round(avg(score)), 0)::int        as media_score,
           count(*) filter (where score >= 80)::int   as calientes
    from leads
  )
  select jsonb_build_object(
    'totalCalls', c.total, 'totalLeads', l.total,
    'avgDuration', c.media_duracion, 'avgLeadScore', l.media_score,
    'hotLeads', l.calientes,
    'conversionRate', case when c.total > 0
                        then round((l.total::numeric / c.total) * 100, 1)
                        else 0 end
  )
  from c, l
$$;

create or replace function public.resumen_de_informe(
  p_client_id text,
  p_desde     timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',          count(*),
    'calientes',      count(*) filter (where coalesce(score, 0) >= 80),
    'ganados',        count(*) filter (where status = 'won'),
    'ganadosPeriodo', count(*) filter (
                        where status = 'won'
                          and (p_desde is null
                               or coalesce(updated_at, created_at) >= p_desde)),
    'nuevosPeriodo',  count(*) filter (where p_desde is null or created_at >= p_desde),
    'pipeline',       coalesce(sum(valor_estimado)
                        filter (where status not in ('won','lost')), 0)
  )
  from leads
  where client_id = p_client_id
$$;

-- ── La cola ───────────────────────────────────────────────────────────────

create table if not exists public.trabajos (
  id            bigserial primary key,
  tipo          text        not null,
  client_id     text,
  datos         jsonb       not null default '{}'::jsonb,
  estado        text        not null default 'pendiente'
                            check (estado in ('pendiente','en_curso','hecho','fallido')),
  -- La espera crece con cada fallo: reintentar en bucle contra un proveedor
  -- caído lo tumba más y gasta el presupuesto.
  intentos      integer     not null default 0,
  no_antes_de   timestamptz not null default now(),
  -- Para soltar los que se quedaron a medias porque el trabajador se murió.
  trabajador    text,
  tomado_en     timestamptz,
  error         text,
  creado_en     timestamptz not null default now(),
  terminado_en  timestamptz,
  clave_unica   text
);

create index if not exists trabajos_por_coger
  on public.trabajos (no_antes_de, id)
  where estado = 'pendiente';

create index if not exists trabajos_por_empresa
  on public.trabajos (client_id, creado_en desc);

-- Impide tener dos iguales esperando a la vez. Los terminados no estorban.
create unique index if not exists trabajos_clave_pendiente
  on public.trabajos (clave_unica)
  where clave_unica is not null and estado in ('pendiente','en_curso');

-- El `for update skip locked` es lo que hace que esto sea una cola y no una
-- lista compartida: dos trabajadores que preguntan a la vez se llevan filas
-- distintas. Sin él, la forma habitual —leer, y luego marcar— tiene una
-- carrera en medio, y el precio de esa carrera aquí es mandar el mismo
-- mensaje dos veces a un cliente.
create or replace function public.tomar_trabajos(
  p_cuantos    integer,
  p_trabajador text
)
returns setof public.trabajos
language sql
security definer
set search_path = public
as $$
  update public.trabajos t
  set estado = 'en_curso', intentos = t.intentos + 1,
      trabajador = p_trabajador, tomado_en = now()
  where t.id in (
    select id from public.trabajos
    where estado = 'pendiente' and no_antes_de <= now()
    order by no_antes_de, id
    limit least(greatest(coalesce(p_cuantos, 10), 1), 100)
    for update skip locked
  )
  returning t.*;
$$;

-- Un trabajador puede morirse a media faena y dejar su trabajo en 'en_curso'
-- para siempre. Pasado un rato prudente, vuelve a la cola.
create or replace function public.rescatar_trabajos_colgados(
  p_minutos integer default 15
)
returns integer
language sql
security definer
set search_path = public
as $$
  with sueltos as (
    update public.trabajos
    set estado = 'pendiente', trabajador = null, tomado_en = null, no_antes_de = now()
    where estado = 'en_curso'
      and tomado_en < now() - make_interval(mins => greatest(coalesce(p_minutos, 15), 1))
    returning 1
  )
  select coalesce(count(*), 0)::integer from sueltos;
$$;

-- ── Puertas ───────────────────────────────────────────────────────────────
-- Ninguna política de RLS: nadie entra por la puerta pública. Sólo la clave
-- de servicio, que lleva BYPASSRLS, igual que el resto de tablas.

alter table public.trabajos enable row level security;

revoke all on table    public.trabajos          from public, anon, authenticated;
revoke all on sequence public.trabajos_id_seq   from public, anon, authenticated;

revoke all on function public.cuenta_o_estima(text)                     from public, anon, authenticated;
revoke all on function public.resumen_de_empresas(integer, text)        from public, anon, authenticated;
revoke all on function public.resumen_global()                          from public, anon, authenticated;
revoke all on function public.resumen_de_informe(text, timestamptz)     from public, anon, authenticated;
revoke all on function public.tomar_trabajos(integer, text)             from public, anon, authenticated;
revoke all on function public.rescatar_trabajos_colgados(integer)       from public, anon, authenticated;

grant execute on function public.cuenta_o_estima(text)                  to service_role;
grant execute on function public.resumen_de_empresas(integer, text)     to service_role;
grant execute on function public.resumen_global()                       to service_role;
grant execute on function public.resumen_de_informe(text, timestamptz)  to service_role;
grant execute on function public.tomar_trabajos(integer, text)          to service_role;
grant execute on function public.rescatar_trabajos_colgados(integer)    to service_role;
