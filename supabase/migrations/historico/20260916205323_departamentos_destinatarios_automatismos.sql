alter table public.client_settings add column if not exists daily_report_email text;
alter table public.client_settings add column if not exists ia_config jsonb not null default '{}'::jsonb;

create table if not exists public.departamentos (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  clave text not null,
  nombre text not null,
  descripcion text,
  palabras_clave text[] not null default '{}',
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, clave)
);
create index if not exists departamentos_empresa_idx on public.departamentos(client_id, orden);

create table if not exists public.destinatarios (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  nombre text not null,
  email text not null,
  cargo text,
  departamentos text[] not null default '{}',
  recibe_todo boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists destinatarios_empresa_idx on public.destinatarios(client_id, activo);

alter table public.leads add column if not exists departamento text;
alter table public.leads add column if not exists departamento_motivo text;
alter table public.leads add column if not exists departamento_confianza numeric(4,3);
alter table public.leads add column if not exists clasificado_en timestamptz;
alter table public.leads add column if not exists senales jsonb;
create index if not exists leads_departamento_idx on public.leads(client_id, departamento) where departamento is not null;

create table if not exists public.notificaciones_lead (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  destinatario_id uuid references public.destinatarios(id) on delete set null,
  email text not null,
  motivo text not null,
  estado text not null check (estado in ('enviado','fallido','omitido')),
  proveedor_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists notificaciones_lead_cursor_idx on public.notificaciones_lead(client_id, created_at desc, id desc);

create table if not exists public.automatismos (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  tipo text not null,
  activo boolean not null default false,
  modo text not null default 'avisar' check (modo in ('avisar','preparar','solo')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tipo)
);

create table if not exists public.automatismos_ejecuciones (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  tipo text not null,
  lead_id uuid references public.leads(id) on delete set null,
  modo text not null,
  resultado text not null check (resultado in ('hecho','preparado','avisado','omitido','fallido')),
  detalle jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists automatismos_ejecuciones_cursor_idx on public.automatismos_ejecuciones(client_id, created_at desc, id desc);

create table if not exists public.restablecer_password (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  client_id text not null references public.clients(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists restablecer_password_caducidad_idx on public.restablecer_password(expires_at);

do $$
declare t text;
begin
  foreach t in array array['departamentos','destinatarios','notificaciones_lead','automatismos','automatismos_ejecuciones','restablecer_password'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists sin_acceso_publico on public.%I', t);
    execute format('create policy sin_acceso_publico on public.%I as restrictive to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;;
