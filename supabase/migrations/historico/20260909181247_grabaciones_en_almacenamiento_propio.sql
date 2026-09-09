-- Las grabaciones dejan de vivir en casa del proveedor.
--
-- DOS PROBLEMAS, Y EL SEGUNDO ES SERIO.
--
-- El primero: `recording_url` guarda la dirección que da Telnyx. Si mañana se
-- cambia de proveedor, si la cuenta se suspende un mes, o si ellos rotan las
-- direcciones, todas las grabaciones del histórico dejan de sonar a la vez.
-- Son conversaciones de clientes de otras empresas: no es material nuestro que
-- podamos permitirnos perder.
--
-- El segundo: el portal pinta <audio src={recording_url}>. Eso significa que
-- el navegador de quien mira va DIRECTO al proveedor, sin pasar por Nesped y
-- sin que nadie compruebe de qué empresa es esa llamada. Para que suene, la
-- dirección tiene que ser accesible sin credenciales. Es decir: cualquiera que
-- consiga una de esas direcciones —de un registro, de una respuesta de la API,
-- de una copia de seguridad— puede escuchar la llamada de un cliente.
--
-- Y una tercera de propina. La retención pone recording_url a null a los 30
-- días. El aviso legal dice que la grabación se borra a los 30 días. No se
-- borra: Nesped se olvida del enlace y el audio sigue en Telnyx. Eso no es un
-- descuido técnico, es una promesa que no se cumple.
--
-- Con esto la grabación se copia a un depósito privado propio, se sirve con
-- una dirección firmada que caduca, y borrarla la borra de verdad.

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
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Dónde está la copia propia. Se guarda aparte de recording_url para no perder
-- la del proveedor mientras la copia no esté hecha: si la copia falla, todavía
-- se puede reintentar desde el original.
alter table public.calls add column if not exists grabacion_propia text;

-- Cuándo se copió, para poder ver cuántas están pendientes.
alter table public.calls add column if not exists grabacion_copiada_en timestamptz;

-- Índice sobre lo que aún no se ha copiado. Parcial: sólo interesan las que
-- faltan, y son pocas comparadas con el total.
create index if not exists calls_grabacion_sin_copiar
  on public.calls (created_at)
  where recording_url is not null and grabacion_propia is null;;
