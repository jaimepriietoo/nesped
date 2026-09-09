-- Fase 3: las grabaciones dejan de vivir en casa del proveedor.
-- Aplicado en producción el 2026-09-09.
--
-- TRES PROBLEMAS, Y LOS DOS ÚLTIMOS SON SERIOS.
--
-- El primero. `recording_url` guarda la dirección que da Telnyx. Si mañana se
-- cambia de proveedor, si la cuenta se suspende un mes, o si ellos rotan las
-- direcciones, todas las grabaciones del histórico dejan de sonar a la vez.
-- Son conversaciones de clientes de otras empresas: no es material nuestro que
-- podamos permitirnos perder.
--
-- El segundo. El portal pintaba <audio src={recording_url}>. Eso significa que
-- el navegador de quien mira va DIRECTO al proveedor, sin pasar por Nesped y
-- sin que nadie compruebe de qué empresa es esa llamada. Para que suene, la
-- dirección tiene que abrirse sin credenciales: cualquiera que consiga una
-- —de un registro, de una respuesta de la API, de una copia de seguridad—
-- escucha la conversación de un cliente ajeno.
--
-- El tercero. La retención ponía recording_url a null a los treinta días. El
-- aviso legal dice que la grabación se borra a los treinta días. No se
-- borraba: Nesped se olvidaba del enlace y el audio seguía en Telnyx. Eso no
-- es un descuido técnico, es una promesa que no se cumple.
--
-- Con esto la grabación se copia a un depósito privado propio, se sirve con
-- una dirección firmada que caduca a los diez minutos, y borrarla la borra.
--
-- Comprobado contra Supabase: con firma 200, sin firma 400, con una firma
-- inventada 400 (InvalidJWT).

-- El depósito. `public = false`: nada se sirve sin firma.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'grabaciones',
  'grabaciones',
  false,
  -- Una llamada de una hora en mp3 no llega a 60 MB. El tope está para que un
  -- fallo del proveedor no suba un fichero de gigabytes.
  104857600,
  array['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Dónde está la copia propia. Se guarda aparte de recording_url para no perder
-- la del proveedor mientras la copia no esté hecha: si la copia falla, todavía
-- se puede reintentar desde el original.
alter table public.calls add column if not exists grabacion_propia text;
alter table public.calls add column if not exists grabacion_copiada_en timestamptz;

-- Índice parcial sobre lo que aún no se ha copiado: sólo interesan las que
-- faltan, y son pocas comparadas con el total.
create index if not exists calls_grabacion_sin_copiar
  on public.calls (created_at)
  where recording_url is not null and grabacion_propia is null;
