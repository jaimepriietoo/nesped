-- Cada llamada a la IA, apuntada.
--
-- Nesped paga por tokens y no sabía cuántos gastaba, ni quién, ni en qué.
-- Los cinco sitios que hablan con OpenAI pasan ahora por un envoltorio
-- (lib/server/ia.js) que mide y escribe aquí: empresa, uso, modelo, versión
-- del prompt, tokens de entrada y salida, coste ESTIMADO con la tarifa
-- versionada, duración y si salió bien. Es la base de los topes de gasto por
-- empresa y de la observabilidad de IA cuando haya volumen.
--
-- No se guarda el prompt ni la respuesta: llevan datos personales y un
-- registro de coste no los necesita.
create table if not exists public.ia_llamadas (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.clients(id) on delete set null,
  uso text not null,
  modelo text not null,
  prompt_version text,
  tokens_entrada integer,
  tokens_salida integer,
  coste_estimado numeric(10,6),
  tarifa_version text,
  duracion_ms integer,
  ok boolean not null default true,
  error text,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists ia_llamadas_client_created_idx on public.ia_llamadas(client_id, created_at desc);
create index if not exists ia_llamadas_created_idx on public.ia_llamadas(created_at desc);

alter table public.ia_llamadas enable row level security;
alter table public.ia_llamadas force row level security;
revoke all on public.ia_llamadas from public, anon, authenticated;
grant select, insert, update, delete on public.ia_llamadas to service_role;
drop policy if exists sin_acceso_publico on public.ia_llamadas;
create policy sin_acceso_publico on public.ia_llamadas as restrictive to anon, authenticated using (false) with check (false);

create or replace function public.gasto_ia_del_dia(p_client_id text)
returns table(llamadas bigint, tokens bigint, coste numeric)
language sql stable security invoker set search_path to 'public', 'pg_temp' as $$
  select count(*), coalesce(sum(tokens_entrada + tokens_salida), 0), coalesce(sum(coste_estimado), 0)
  from public.ia_llamadas
  where client_id = p_client_id and created_at >= date_trunc('day', now());
$$;
revoke execute on function public.gasto_ia_del_dia(text) from public, anon, authenticated;
grant execute on function public.gasto_ia_del_dia(text) to service_role;
