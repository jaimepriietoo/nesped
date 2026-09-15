-- Los interruptores de emergencia.
--
-- Nesped gasta dinero en cada llamada y en cada generación de texto. Los
-- cortacircuitos protegen de un proveedor caído; esto protege de lo otro:
-- un fallo propio, un bucle, un cliente que dispara diez mil peticiones.
-- Para eso hace falta poder parar sin desplegar nada, en segundos.
--
-- Tres de plataforma en una única fila de ajustes_plataforma (pausa_global,
-- pausa_ia, pausa_llamadas) y dos por empresa en clients (ia_pausada,
-- llamadas_pausadas). El código los lee con caché de treinta segundos por
-- instancia: es lo que tarda en hacerse efectivo un apagado.
--
-- Para activar uno sin pasar por la aplicación:
--   update ajustes_plataforma set pausa_ia = true, motivo = 'incidente';
--   update clients set ia_pausada = true where id = 'empresa';
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
create policy sin_acceso_publico on public.ajustes_plataforma as restrictive to anon, authenticated using (false) with check (false);
