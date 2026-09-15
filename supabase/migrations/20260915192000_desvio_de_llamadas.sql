-- Desvío de llamadas al teléfono del cliente.
--
-- La única mitigación real cuando ElevenLabs se cae. Cada empresa guarda a
-- qué teléfono desviar, si el desvío está activo, y a dónde apuntaba su
-- número de Twilio antes, para restaurarlo tal cual (lib/server/desvio.js).
alter table public.clients add column if not exists telefono_desvio text;
alter table public.clients add column if not exists desvio_activo boolean not null default false;
alter table public.clients add column if not exists desvio_voice_url_anterior text;
alter table public.clients add column if not exists desvio_cambiado_en timestamptz;
