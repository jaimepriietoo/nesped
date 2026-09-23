create table if not exists public.conocimiento (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  origen text not null default 'portal' check (origen in ('portal', 'voz')),
  autor text not null default '',
  activo boolean not null default true,
  vigente_hasta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conocimiento_vigente
  on public.conocimiento (client_id, created_at desc)
  where activo;

alter table public.conocimiento enable row level security;
alter table public.conocimiento force row level security;
revoke all on public.conocimiento from public, anon, authenticated;
grant select, insert, update, delete on public.conocimiento to service_role;
grant select, insert, update, delete on public.conocimiento to nesped_app;

drop policy if exists sin_acceso_publico on public.conocimiento;
create policy sin_acceso_publico on public.conocimiento
  as restrictive for all to anon, authenticated using (false) with check (false);

drop policy if exists nesped_aislamiento_empresa on public.conocimiento;
create policy nesped_aislamiento_empresa on public.conocimiento
  as permissive for all to nesped_app
  using ((select current_setting('app.client_id', true)) = client_id)
  with check ((select current_setting('app.client_id', true)) = client_id);

alter table public.client_settings
  add column if not exists ruperta_pin_hash text;

notify pgrst, 'reload schema';;
