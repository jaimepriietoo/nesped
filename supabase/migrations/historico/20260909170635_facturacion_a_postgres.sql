-- Suscripciones y facturas, en Postgres.
--
-- Vivían en Prisma con datasource sqlite y DATABASE_URL="file:./dev.db". Ese
-- fichero está en .gitignore, así que no se despliega, y el disco de Vercel es
-- efímero y por función. Comprobado: ninguna de estas tablas existía en
-- Postgres. No es que los datos se perdieran al desplegar, es que no llegaban
-- a escribirse en ningún sitio duradero.
--
-- Se replica la forma exacta que tenían los modelos de Prisma para que el
-- cambio en el código sea sólo de cliente de base de datos, no de estructura.

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  client_id              text references public.clients(id) on delete set null,
  stripe_subscription_id text not null unique,
  status                 text not null,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  client_id         text references public.clients(id) on delete set null,
  stripe_invoice_id text not null unique,
  amount            numeric(12,2) not null default 0,
  currency          text not null default 'eur',
  status            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- La consulta real es siempre "las de esta empresa, por fecha".
create index if not exists subscriptions_client_created_idx
  on public.subscriptions (client_id, created_at desc);
create index if not exists invoices_client_created_idx
  on public.invoices (client_id, created_at desc);

comment on table public.subscriptions is
  'Suscripciones de Stripe. stripe_subscription_id es único: es lo que hace idempotente el webhook.';
comment on table public.invoices is
  'Facturas de Stripe. stripe_invoice_id es único por el mismo motivo.';

-- Mismo blindaje que el resto: la clave pública no tiene permiso ni política.
revoke all on public.subscriptions from anon, authenticated;
revoke all on public.invoices      from anon, authenticated;

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

drop policy if exists sin_acceso_publico on public.subscriptions;
create policy sin_acceso_publico on public.subscriptions
  as restrictive to anon, authenticated using (false) with check (false);

drop policy if exists sin_acceso_publico on public.invoices;
create policy sin_acceso_publico on public.invoices
  as restrictive to anon, authenticated using (false) with check (false);;
