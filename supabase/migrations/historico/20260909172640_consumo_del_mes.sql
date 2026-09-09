-- Consumo acumulado del mes en curso, por empresa.
--
-- Sumar en la aplicación exigiría traerse los treinta registros diarios en
-- cada comprobación, y esto se consulta al empezar cada llamada: es el sitio
-- donde una consulta de más se nota.
create or replace function public.consumo_del_mes(p_client_id text)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'llamadas',       coalesce(sum(llamadas), 0),
    'minutos',        round(coalesce(sum(segundos_voz), 0) / 60.0),
    'caracteresVoz',  coalesce(sum(caracteres_voz), 0),
    'tokensIa',       coalesce(sum(tokens_ia), 0),
    'desde',          date_trunc('month', current_date)::date
  )
  from public.consumo_diario
  where client_id = p_client_id
    and dia >= date_trunc('month', current_date)::date;
$$;

comment on function public.consumo_del_mes(text) is
  'Consumo del mes en curso. Solo para el servidor: se revoca EXECUTE a PUBLIC.';

revoke execute on function public.consumo_del_mes(text) from public;;
