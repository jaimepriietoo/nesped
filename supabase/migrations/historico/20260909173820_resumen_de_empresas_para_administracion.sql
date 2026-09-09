-- El panel de administración contaba en JavaScript.
--
-- Pedía TODAS las llamadas, TODOS los contactos y TODOS los usuarios de TODAS
-- las empresas, y luego, por cada empresa, recorría los tres arrays enteros
-- con un filter. Es cuadrático: con 200 empresas y cien mil llamadas son
-- veinte millones de comparaciones y la respuesta entera en memoria.
--
-- Con las cifras de hoy funciona. Es justo la clase de cosa que sigue
-- funcionando hasta el día que deja de funcionar del todo, y ese día el panel
-- que se cae es el que hace falta para entender por qué se cae.
--
-- Contar es trabajo de la base de datos. Esta función devuelve una página de
-- empresas ya agregada, usando los índices (client_id, created_at) que se
-- crearon en la fase 0.
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
  -- Una página de empresas, ordenadas por id para que el cursor sea estable.
  -- Ordenar por una fecha obligaría a desempatar; el id ya es único.
  with pagina as (
    select c.id, c.name, c.plan, c.status
    from clients c
    where p_desde is null or c.id > p_desde
    order by c.id
    limit v_limite
  ),
  -- El lateral agrega SOLO las filas de las empresas de esta página. Sin él,
  -- un group by recorrería las llamadas de todas las empresas para devolver
  -- cien.
  contadas as (
    select
      p.id,
      p.name,
      p.plan,
      p.status,
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
        'client_id',   id,
        'client_name', name,
        'plan',        plan,
        'status',      status,
        'total_calls', total_calls,
        'total_leads', total_leads,
        'users',       users,
        'conversion',  case when total_calls > 0
                         then round((total_leads::numeric / total_calls) * 100, 1)
                         else 0 end
      ) order by id
    ), '[]'::jsonb),
    max(id)
  into v_empresas, v_siguiente
  from contadas;

  -- Totales globales.
  --
  -- Mientras las tablas son pequeñas se cuentan de verdad. Pasado cierto
  -- tamaño un count(*) recorre la tabla entera y es exactamente lo que se
  -- venía a quitar, así que se usa la estimación del planificador y se dice
  -- que es una estimación. Un panel que tarda treinta segundos en dar una
  -- cifra exacta es peor que uno instantáneo que avisa de que redondea.
  select jsonb_build_object(
    'totalClients', (select count(*) from clients),
    'totalUsers',   (select count(*) from portal_users),
    'totalCalls',   public.cuenta_o_estima('calls'),
    'totalLeads',   public.cuenta_o_estima('leads'),
    'exactas',      (select coalesce(max(reltuples), 0) < 500000
                     from pg_class where relname in ('calls','leads'))
  ) into v_totales;

  return jsonb_build_object(
    'clients',  v_empresas,
    'metrics',  v_totales,
    -- Null cuando la página venía vacía: no hay más.
    'cursor',   case when jsonb_array_length(v_empresas) < v_limite
                  then null else v_siguiente end
  );
end;
$$;

-- Cuenta exacto mientras se pueda, estima cuando contar salga caro.
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

revoke all on function public.resumen_de_empresas(integer, text) from public, anon, authenticated;
revoke all on function public.cuenta_o_estima(text)              from public, anon, authenticated;
grant execute on function public.resumen_de_empresas(integer, text) to service_role;
grant execute on function public.cuenta_o_estima(text)              to service_role;;
