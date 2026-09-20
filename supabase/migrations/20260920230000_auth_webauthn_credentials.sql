-- Passkeys (WebAuthn) como segundo factor.
--
-- TOTP se puede phishear: un sitio falso pide el código y lo reenvía al de
-- verdad. Una passkey no: la firma va atada al dominio y el navegador no la
-- entrega a otro. Aquí se guarda la clave PÚBLICA de cada passkey y su
-- contador; la privada nunca sale del dispositivo de la persona.
--
-- Cerrada al Data API. Sólo el servidor con service_role la lee y escribe.

create table if not exists public.auth_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text not null default '',
  backed_up boolean not null default false,
  nombre text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists auth_webauthn_credentials_por_usuario
  on public.auth_webauthn_credentials (client_id, email);

alter table public.auth_webauthn_credentials enable row level security;
alter table public.auth_webauthn_credentials force row level security;

revoke all on public.auth_webauthn_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.auth_webauthn_credentials to service_role;

drop policy if exists sin_acceso_publico on public.auth_webauthn_credentials;
create policy sin_acceso_publico on public.auth_webauthn_credentials
  as restrictive for all to anon, authenticated
  using (false) with check (false);

notify pgrst, 'reload schema';
