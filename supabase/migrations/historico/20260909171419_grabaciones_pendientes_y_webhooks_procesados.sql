-- ── 1. Grabaciones que llegan antes que su llamada ────────────────────
--
-- El aviso de grabación de Twilio y el final de la llamada son dos sucesos
-- independientes y llegan en cualquier orden. Cuando la grabación llega
-- primero, no hay todavía fila en `calls` que actualizar, así que había que
-- guardarla en alguna parte hasta que la hubiera.
--
-- Esa parte era un Map en la RAM del servidor de voz. Con una instancia
-- funciona; con dos, el aviso puede caer en la máquina que no atendió la
-- llamada, y entonces recording_url se guarda como null SIN ningún error. Se
-- perderían grabaciones en silencio.
--
-- Era el único motivo por el que no se podía añadir una segunda instancia, y
-- por tanto la razón de que todas las llamadas de todos los clientes
-- dependieran de un solo proceso.
create table if not exists public.grabaciones_pendientes (
  call_sid      text primary key,
  client_id     text not null,
  recording_url text not null,
  created_at    timestamptz not null default now()
);

create index if not exists grabaciones_pendientes_created_idx
  on public.grabaciones_pendientes (created_at);

comment on table public.grabaciones_pendientes is
  'Puente entre el aviso de grabación y el guardado de la llamada, cuando llegan desordenados. Las filas se borran al usarse; las que pasen de un día se limpian solas.';

-- ── 2. Webhooks ya procesados ─────────────────────────────────────────
--
-- La idempotencia de Stripe se resolvía recorriendo los 200 eventos más
-- recientes buscando duplicados. Con volumen eso deja de funcionar: un
-- reintento tardío cae fuera de la ventana y el pago se registra dos veces.
--
-- Una clave única lo resuelve sin ventana ni recorrido: o el evento está, o
-- no está.
create table if not exists public.webhooks_procesados (
  proveedor   text not null,
  evento_id   text not null,
  procesado_en timestamptz not null default now(),
  primary key (proveedor, evento_id)
);

create index if not exists webhooks_procesados_fecha_idx
  on public.webhooks_procesados (procesado_en);

comment on table public.webhooks_procesados is
  'Eventos de webhook ya aplicados. La clave primaria compuesta es la garantía: reintentar no duplica.';

/**
 * Marca un evento como procesado.
 *
 * Devuelve true si es la primera vez —hay que procesarlo— y false si ya
 * estaba. La condición de carrera se resuelve en la base de datos: si dos
 * reintentos llegan a la vez, sólo uno consigue insertar.
 */
create or replace function public.reclamar_webhook(p_proveedor text, p_evento_id text)
returns boolean
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  insertado boolean;
begin
  insert into public.webhooks_procesados (proveedor, evento_id)
  values (p_proveedor, p_evento_id)
  on conflict (proveedor, evento_id) do nothing;

  get diagnostics insertado = row_count;
  return insertado;
end;
$$;

revoke execute on function public.reclamar_webhook(text, text) from public;

-- Mismo blindaje que el resto.
revoke all on public.grabaciones_pendientes from anon, authenticated;
revoke all on public.webhooks_procesados    from anon, authenticated;

alter table public.grabaciones_pendientes enable row level security;
alter table public.grabaciones_pendientes force row level security;
alter table public.webhooks_procesados enable row level security;
alter table public.webhooks_procesados force row level security;

drop policy if exists sin_acceso_publico on public.grabaciones_pendientes;
create policy sin_acceso_publico on public.grabaciones_pendientes
  as restrictive to anon, authenticated using (false) with check (false);

drop policy if exists sin_acceso_publico on public.webhooks_procesados;
create policy sin_acceso_publico on public.webhooks_procesados
  as restrictive to anon, authenticated using (false) with check (false);;
