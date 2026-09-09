-- Agrega en la base de datos lo que el portal calculaba trayéndose todo.
--
-- /api/portal/overview pedía TODOS los contactos y TODAS las llamadas de la
-- empresa, sin límite, en cada carga. Después contaba en JavaScript:
-- totalCalls = calls.length. Con 2 y 29 filas es gratis; con cincuenta mil
-- contactos es una respuesta de megabytes y varios segundos, en la ruta más
-- visitada del producto.
--
-- Poner un LIMIT a secas habría sido peor que dejarlo: las cifras habrían
-- pasado a contar "hasta N" en vez del total, y habrían salido mal sin dar
-- ningún error. Contar es trabajo de la base de datos.
--
-- Una sola llamada devuelve todo el resumen: así no se cambian nueve
-- consultas por veinte.
create or replace function public.resumen_portal(p_client_id text)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'llamadas', (
      select jsonb_build_object(
        'total',            count(*),
        'duracionTotal',    coalesce(sum(duration_seconds), 0),
        'conLead',          count(*) filter (where lead_captured),
        'ultimos14',        count(*) filter (where created_at > now() - interval '14 days')
      )
      from public.calls where client_id = p_client_id
    ),
    'contactos', (
      select jsonb_build_object(
        'total',            count(*),
        'sumaScore',        coalesce(sum(score), 0),
        'calientes',        count(*) filter (where score >= 80),
        'sinResponsable',   count(*) filter (where owner is null or owner = ''),
        'smsEnviado',       count(*) filter (where followup_sms_sent),
        'valorPotencial',   coalesce(sum(valor_estimado) filter (where status not in ('won','lost')), 0),
        'porFase', (
          select coalesce(jsonb_object_agg(fase, n), '{}'::jsonb)
          from (
            select coalesce(status, 'new') as fase, count(*) as n
            from public.leads where client_id = p_client_id
            group by 1
          ) f
        )
      )
      from public.leads where client_id = p_client_id
    )
  );
$$;

comment on function public.resumen_portal(text) is
  'Resumen agregado del portal. Solo para el servidor: se revoca EXECUTE a PUBLIC como el resto.';

-- Las funciones nacen con EXECUTE para PUBLIC, que incluye a anon. Revocarlo
-- a anon no bastaría: hay que quitárselo a PUBLIC.
revoke execute on function public.resumen_portal(text) from public;;
