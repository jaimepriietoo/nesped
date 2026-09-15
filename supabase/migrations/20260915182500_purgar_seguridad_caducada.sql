-- Las tablas de seguridad también crecen y nada las limpiaba.
--
-- security_rate_limits recibe una fila por cada ventana de límite que se
-- abre —cada intento de login, cada llamada de demostración— y
-- auth_challenges una por cada segundo factor que se pide. Las dos tienen
-- expires_at y un índice sobre él, pero ninguna purga. Con tráfico, son las
-- que más deprisa crecen y las que menos valen una vez vencidas.
--
-- Un solo RPC que borra por lotes lo vencido, para llamarlo desde el
-- mantenimiento diario con el mismo presupuesto de tiempo que el resto. Los
-- retos se guardan un día después de vencer o consumirse: es lo que hace
-- falta para investigar un intento de acceso raro.
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
grant execute on function public.purgar_seguridad_caducada(integer) to service_role;
