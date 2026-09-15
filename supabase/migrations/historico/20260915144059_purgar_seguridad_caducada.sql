create or replace function public.purgar_seguridad_caducada(p_lote integer default 1000)
returns integer
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  n_limites integer;
  n_retos integer;
begin
  with borrados as (
    delete from public.security_rate_limits
    where ctid in (select ctid from public.security_rate_limits where expires_at < now() limit p_lote)
    returning 1
  ) select count(*) into n_limites from borrados;

  with borrados as (
    delete from public.auth_challenges
    where ctid in (
      select ctid from public.auth_challenges
      where expires_at < now() - interval '1 day' or consumed_at < now() - interval '1 day'
      limit p_lote
    )
    returning 1
  ) select count(*) into n_retos from borrados;

  return n_limites + n_retos;
end;
$$;
revoke execute on function public.purgar_seguridad_caducada(integer) from public, anon, authenticated;
grant execute on function public.purgar_seguridad_caducada(integer) to service_role;;
