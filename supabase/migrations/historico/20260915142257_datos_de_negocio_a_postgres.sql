create table if not exists public.lead_memory (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  last_intent text,
  last_objection text,
  temperature text,
  recommended_product text,
  payment_sent boolean not null default false,
  booking_sent boolean not null default false,
  onboarding_started boolean not null default false,
  reactivated boolean not null default false,
  last_summary text,
  updated_at timestamptz not null default now(),
  unique (lead_id)
);
create index if not exists lead_memory_client_idx on public.lead_memory(client_id, updated_at desc);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null,
  price numeric(12,2) not null default 0,
  stripe_price_id text not null,
  active boolean not null default true,
  description text,
  features text,
  created_at timestamptz not null default now()
);
create index if not exists products_activos_idx on public.products(active, tier);
create table if not exists public.upsell_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone text,
  from_tier text,
  to_tier text,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists upsell_events_client_created_idx on public.upsell_events(client_id, created_at desc);
create index if not exists upsell_events_lead_idx on public.upsell_events(lead_id);
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone text,
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null,
  source text,
  owner text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists appointments_client_start_idx on public.appointments(client_id, start_at);
create index if not exists appointments_pendientes_idx on public.appointments(start_at) where status in ('scheduled', 'pending', 'confirmed');
create table if not exists public.message_variants (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.clients(id) on delete cascade,
  name text not null,
  channel text not null,
  stage text not null,
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists message_variants_client_idx on public.message_variants(client_id, active);
create table if not exists public.message_experiment_results (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  variant_id uuid not null references public.message_variants(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists message_experiment_results_variant_idx on public.message_experiment_results(variant_id, created_at desc);
create table if not exists public.lead_reactivations (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone text,
  stage text not null,
  message text not null,
  sent_at timestamptz not null default now()
);
create index if not exists lead_reactivations_lead_idx on public.lead_reactivations(lead_id, sent_at desc);
create index if not exists lead_reactivations_client_idx on public.lead_reactivations(client_id, sent_at desc);
create table if not exists public.industry_playbooks (
  id uuid primary key default gen_random_uuid(),
  industry text not null unique,
  system_prompt text not null,
  objections text not null default '',
  tone text,
  created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['lead_memory','products','upsell_events','appointments',
                           'message_variants','message_experiment_results',
                           'lead_reactivations','industry_playbooks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists sin_acceso_publico on public.%I', t);
    execute format('create policy sin_acceso_publico on public.%I as restrictive to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;;
