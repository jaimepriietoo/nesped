create table if not exists public.webhook_entregas (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  evento text not null,
  url text not null,
  payload jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente','entregado','fallido','muerto')),
  intentos integer not null default 0,
  codigo_http integer,
  respuesta text,
  ultimo_error text,
  trabajo_id uuid,
  created_at timestamptz not null default now(),
  entregado_en timestamptz
);
create index if not exists webhook_entregas_cursor_idx on public.webhook_entregas(client_id, created_at desc, id desc);
create index if not exists webhook_entregas_estado_idx on public.webhook_entregas(estado, created_at desc) where estado in ('fallido','muerto');
alter table public.webhook_entregas enable row level security;
alter table public.webhook_entregas force row level security;
revoke all on public.webhook_entregas from public, anon, authenticated;
grant select, insert, update, delete on public.webhook_entregas to service_role;
drop policy if exists sin_acceso_publico on public.webhook_entregas;
create policy sin_acceso_publico on public.webhook_entregas as restrictive to anon, authenticated using (false) with check (false);

create or replace function public.purgar_webhook_entregas(p_dias integer default 30, p_lote integer default 5000)
returns integer language plpgsql security invoker set search_path to 'public', 'pg_temp' as $$
declare n integer;
begin
  with borrar as (
    select id from public.webhook_entregas
    where created_at < now() - make_interval(days => p_dias)
    order by created_at limit p_lote
  )
  delete from public.webhook_entregas w using borrar where w.id = borrar.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purgar_webhook_entregas(integer, integer) from public, anon, authenticated;
grant execute on function public.purgar_webhook_entregas(integer, integer) to service_role;;
