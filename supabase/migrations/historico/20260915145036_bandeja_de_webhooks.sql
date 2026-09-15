create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  tipo text,
  evento_id text,
  client_id text references public.clients(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_curso','procesado','fallido','muerto')),
  intentos integer not null default 0,
  recibido_en timestamptz not null default now(),
  procesado_en timestamptz,
  ultimo_error text,
  trabajo_id bigint
);
create unique index if not exists webhook_events_proveedor_evento on public.webhook_events(proveedor, evento_id) where evento_id is not null;
create index if not exists webhook_events_estado_idx on public.webhook_events(estado, recibido_en);
create index if not exists webhook_events_client_idx on public.webhook_events(client_id, recibido_en desc);

alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;
revoke all on public.webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.webhook_events to service_role;
drop policy if exists sin_acceso_publico on public.webhook_events;
create policy sin_acceso_publico on public.webhook_events as restrictive to anon, authenticated using (false) with check (false);

create or replace function public.purgar_webhook_events(p_dias integer default 30, p_lote integer default 1000)
returns integer language plpgsql security invoker set search_path to 'public', 'pg_temp' as $$
declare n integer;
begin
  with borrados as (
    delete from public.webhook_events
    where ctid in (
      select ctid from public.webhook_events
      where estado = 'procesado' and procesado_en < now() - make_interval(days => p_dias)
      limit p_lote
    ) returning 1
  ) select count(*) into n from borrados;
  return n;
end $$;
revoke execute on function public.purgar_webhook_events(integer, integer) from public, anon, authenticated;
grant execute on function public.purgar_webhook_events(integer, integer) to service_role;;
