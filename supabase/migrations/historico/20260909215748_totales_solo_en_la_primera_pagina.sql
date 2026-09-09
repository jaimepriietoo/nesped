-- Los totales globales se calculaban en CADA página del panel.
--
-- Medido con 506 empresas y 45.000 llamadas: una página cuesta 13,5 ms y 7,4
-- de ellos son los totales. O sea que más de la mitad del trabajo de cada
-- página a partir de la segunda es volver a contar exactamente lo mismo.
--
-- Y esa proporción empeora con el tiempo: el coste de una página no cambia
-- —siempre son cien empresas—, pero contar todas las llamadas de la
-- plataforma crece con la plataforma. A 200.000 empresas, paginar el panel
-- entero significaría contar la tabla de llamadas dos mil veces seguidas.
--
-- Los totales no cambian mientras se pagina, así que se dan una vez y ya. El
-- panel se los queda de la primera respuesta.
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

  -- Sólo en la primera página. Las siguientes devuelven null y quien pagina
  -- se queda con los que ya tenía.
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
grant execute on function public.resumen_de_empresas(integer, text) to service_role;;
