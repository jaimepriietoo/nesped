-- Evita que un reintento del navegador envíe dos veces el mismo mensaje.
--
-- La fila se reclama ANTES de llamar a Twilio o Resend. Si el proceso cae
-- después de que el proveedor acepte el mensaje, la misma clave queda
-- bloqueada y no se vuelve a enviar a ciegas. Sólo se guarda un hash del
-- contenido, nunca el texto, correo ni teléfono del destinatario.
--
-- Es una migración aditiva: no modifica ni borra tablas existentes. La tabla
-- queda cerrada al Data API y sólo la usa el servidor con service_role.

create table if not exists public.mensajes_salientes_idempotentes (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  request_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'enviando'
    check (status in ('enviando', 'enviado', 'fallido')),
  delivery jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (client_id, request_id)
);

create index if not exists mensajes_salientes_por_empresa_fecha
  on public.mensajes_salientes_idempotentes(client_id, created_at desc);

alter table public.mensajes_salientes_idempotentes enable row level security;
alter table public.mensajes_salientes_idempotentes force row level security;

revoke all on public.mensajes_salientes_idempotentes from public, anon, authenticated;
grant select, insert, update on public.mensajes_salientes_idempotentes to service_role;

drop policy if exists sin_acceso_publico on public.mensajes_salientes_idempotentes;
create policy sin_acceso_publico on public.mensajes_salientes_idempotentes
  as restrictive for all to anon, authenticated
  using (false) with check (false);;
