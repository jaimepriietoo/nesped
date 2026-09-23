create table if not exists public.sesiones_activas (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  navegador text not null default '',
  ip_prefijo text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists sesiones_activas_por_usuario
  on public.sesiones_activas (client_id, email, created_at desc);
create index if not exists sesiones_activas_caducadas
  on public.sesiones_activas (last_seen_at);

alter table public.sesiones_activas enable row level security;
alter table public.sesiones_activas force row level security;

revoke all on public.sesiones_activas from public, anon, authenticated;
grant select, insert, update, delete on public.sesiones_activas to service_role;
grant select, update on public.sesiones_activas to nesped_app;

drop policy if exists sin_acceso_publico on public.sesiones_activas;
create policy sin_acceso_publico on public.sesiones_activas
  as restrictive for all to anon, authenticated
  using (false) with check (false);

drop policy if exists nesped_aislamiento_empresa on public.sesiones_activas;
create policy nesped_aislamiento_empresa on public.sesiones_activas
  as permissive for all to nesped_app
  using ((select current_setting('app.client_id', true)) = client_id)
  with check ((select current_setting('app.client_id', true)) = client_id);

create or replace function public.purgar_sesiones_caducadas(p_lote integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  with viejas as (
    select id from public.sesiones_activas
    where last_seen_at < now() - interval '8 days'
    order by last_seen_at
    limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
  )
  delete from public.sesiones_activas s using viejas v where s.id = v.id;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.purgar_sesiones_caducadas(integer) from public, anon, authenticated;
grant execute on function public.purgar_sesiones_caducadas(integer) to service_role;

notify pgrst, 'reload schema';;
