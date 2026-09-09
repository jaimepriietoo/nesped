-- Las seis cifras del panel de administración, contadas en la base de datos.
--
-- Se calculaban trayéndose TODAS las llamadas y TODOS los contactos de TODAS
-- las empresas a la memoria de la función. Y las llamadas incluyen la
-- transcripción entera: la columna más grande de la base de datos viajaba
-- completa por la red para acabar en un `.length`.
--
-- Las medias las hace Postgres sobre la marcha. La única cifra que puede
-- ponerse cara con el tiempo son los totales, y para eso está cuenta_o_estima.
create or replace function public.resumen_global()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with c as (
    select count(*)::bigint                              as total,
           coalesce(round(avg(duration_seconds)), 0)::int as media_duracion
    from calls
  ),
  l as (
    select count(*)::bigint                        as total,
           coalesce(round(avg(score)), 0)::int      as media_score,
           count(*) filter (where score >= 80)::int as calientes
    from leads
  )
  select jsonb_build_object(
    'totalCalls',     c.total,
    'totalLeads',     l.total,
    'avgDuration',    c.media_duracion,
    'avgLeadScore',   l.media_score,
    'hotLeads',       l.calientes,
    'conversionRate', case when c.total > 0
                        then round((l.total::numeric / c.total) * 100, 1)
                        else 0 end
  )
  from c, l
$$;

revoke all on function public.resumen_global() from public, anon, authenticated;
grant execute on function public.resumen_global() to service_role;;
