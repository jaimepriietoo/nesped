-- Las cifras de los informes por correo, contadas en la base de datos.
--
-- Se sacaban trayéndose la cartera entera de la empresa a memoria y contando
-- en JavaScript. Para una empresa con doscientos contactos da igual; para una
-- con cien mil, el informe diario es la petición más cara del día y encima
-- llega tarde.
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
    'total',        count(*),
    'calientes',    count(*) filter (where coalesce(score, 0) >= 80),
    'ganados',      count(*) filter (where status = 'won'),
    -- Ganados dentro de la ventana. Sin ventana, todos.
    'ganadosPeriodo', count(*) filter (
                        where status = 'won'
                          and (p_desde is null
                               or coalesce(updated_at, created_at) >= p_desde)),
    'nuevosPeriodo', count(*) filter (
                        where p_desde is null or created_at >= p_desde),
    -- Lo que sigue vivo: ni ganado ni perdido.
    'pipeline',     coalesce(sum(valor_estimado)
                      filter (where status not in ('won','lost')), 0)
  )
  from leads
  where client_id = p_client_id
$$;

revoke all on function public.resumen_de_informe(text, timestamptz) from public, anon, authenticated;
grant execute on function public.resumen_de_informe(text, timestamptz) to service_role;;
