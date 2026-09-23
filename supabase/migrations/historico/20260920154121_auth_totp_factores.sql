-- Segundo factor TOTP para la autenticación propia de Nesped.
--
-- El secreto compartido nunca se guarda en claro: la aplicación lo cifra con
-- AES-256-GCM y una clave exclusiva (NESPED_TOTP_ENCRYPTION_KEY). La base sólo
-- conserva el sobre cifrado. `last_used_step` impide reutilizar un mismo código
-- de treinta segundos en dos retos simultáneos.
--
-- La tabla vive en public porque ése es el esquema existente de la aplicación,
-- pero queda cerrada al Data API: RLS forzado, sin permisos para anon ni para
-- authenticated y acceso únicamente mediante la service role del servidor.

create table if not exists public.auth_totp_factors (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  secret_ciphertext text not null check (length(secret_ciphertext) between 40 and 2048),
  confirmed_at timestamptz,
  last_used_step bigint not null default -1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, email)
);

create index if not exists auth_totp_factors_confirmed
  on public.auth_totp_factors(client_id, email)
  where confirmed_at is not null;

alter table public.auth_totp_factors enable row level security;
alter table public.auth_totp_factors force row level security;

revoke all on public.auth_totp_factors from public, anon, authenticated;
grant select, insert, update, delete on public.auth_totp_factors to service_role;

drop policy if exists sin_acceso_publico on public.auth_totp_factors;
create policy sin_acceso_publico on public.auth_totp_factors
  as restrictive for all to anon, authenticated
  using (false) with check (false);;
