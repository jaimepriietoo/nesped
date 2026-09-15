create table if not exists public.ajustes_plataforma (
  id text primary key default 'plataforma' check (id = 'plataforma'),
  pausa_global boolean not null default false,
  pausa_ia boolean not null default false,
  pausa_llamadas boolean not null default false,
  motivo text,
  cambiado_por text,
  updated_at timestamptz not null default now()
);
insert into public.ajustes_plataforma (id) values ('plataforma') on conflict (id) do nothing;

alter table public.clients add column if not exists ia_pausada boolean not null default false;
alter table public.clients add column if not exists llamadas_pausadas boolean not null default false;

alter table public.ajustes_plataforma enable row level security;
alter table public.ajustes_plataforma force row level security;
revoke all on public.ajustes_plataforma from public, anon, authenticated;
grant select, insert, update, delete on public.ajustes_plataforma to service_role;
drop policy if exists sin_acceso_publico on public.ajustes_plataforma;
create policy sin_acceso_publico on public.ajustes_plataforma as restrictive to anon, authenticated using (false) with check (false);;
