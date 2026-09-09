-- Una cola de trabajos, para lo que no cabe en una petición.
--
-- Hoy, cuando alguien pide su informe, la petición se queda esperando a que se
-- lea toda su cartera, se redacte el correo y el proveedor lo acepte. Si algo
-- de eso tarda, Vercel corta la función y el trabajo se pierde: no hay
-- reintento, no queda rastro, y quien lo pidió ve un error sin saber si el
-- correo salió o no.
--
-- Lo mismo con el barrido nocturno, que además manda mensajes. Un corte a la
-- mitad deja unos enviados y otros no, y al reintentarlo entero vuelve a
-- mandar los primeros.
--
-- Con esto, pedir un trabajo es escribir una fila. Quien lo ejecuta es otro,
-- por lotes, y si se cae se retoma donde estaba.

create table if not exists public.trabajos (
  id            bigserial primary key,
  tipo          text        not null,
  client_id     text,
  datos         jsonb       not null default '{}'::jsonb,

  estado        text        not null default 'pendiente'
                            check (estado in ('pendiente','en_curso','hecho','fallido')),

  -- Cuántas veces se ha intentado y cuándo se puede volver a intentar. La
  -- espera crece con cada fallo: reintentar en bucle contra un proveedor caído
  -- lo tumba más y gasta el presupuesto de llamadas.
  intentos      integer     not null default 0,
  no_antes_de   timestamptz not null default now(),

  -- Quién lo tiene cogido. Sirve para soltar los que se quedaron a medias
  -- porque el trabajador se murió.
  trabajador    text,
  tomado_en     timestamptz,

  error         text,
  creado_en     timestamptz not null default now(),
  terminado_en  timestamptz,

  -- Evita encolar dos veces lo mismo. Quien quiera ese comportamiento pone
  -- una clave; quien no, la deja a null y puede repetir.
  clave_unica   text
);

-- El índice por el que se reparte: solo mira lo pendiente y ya vencido.
create index if not exists trabajos_por_coger
  on public.trabajos (no_antes_de, id)
  where estado = 'pendiente';

create index if not exists trabajos_por_empresa
  on public.trabajos (client_id, creado_en desc);

-- Un pendiente por clave. Los terminados no estorban: se puede volver a pedir
-- el informe de mañana con la misma clave de hoy... no, con otra; lo que esto
-- impide es tener dos iguales esperando a la vez.
create unique index if not exists trabajos_clave_pendiente
  on public.trabajos (clave_unica)
  where clave_unica is not null and estado in ('pendiente','en_curso');

/**
 * Reparte trabajos a un trabajador.
 *
 * El `for update skip locked` es lo que hace que esto sea una cola y no una
 * lista compartida: dos trabajadores que preguntan a la vez se llevan filas
 * distintas, sin esperarse y sin solaparse. Sin él, la forma habitual —leer,
 * y luego marcar— tiene una carrera en medio, y el precio de esa carrera aquí
 * es mandarle el mismo mensaje dos veces a un cliente.
 */
create or replace function public.tomar_trabajos(
  p_cuantos    integer,
  p_trabajador text
)
returns setof public.trabajos
language sql
security definer
set search_path = public
as $$
  update public.trabajos t
  set estado     = 'en_curso',
      intentos   = t.intentos + 1,
      trabajador = p_trabajador,
      tomado_en  = now()
  where t.id in (
    select id from public.trabajos
    where estado = 'pendiente'
      and no_antes_de <= now()
    order by no_antes_de, id
    limit least(greatest(coalesce(p_cuantos, 10), 1), 100)
    for update skip locked
  )
  returning t.*;
$$;

/**
 * Devuelve a la cola los trabajos que se quedaron colgados.
 *
 * Un trabajador puede morirse a media faena —se acaba el tiempo de la función,
 * se reinicia la máquina— y su trabajo se queda en 'en_curso' para siempre.
 * Pasado un rato prudente se vuelve a poner pendiente. Es preferible a que
 * desaparezca en silencio, que es lo que pasa ahora.
 */
create or replace function public.rescatar_trabajos_colgados(
  p_minutos integer default 15
)
returns integer
language sql
security definer
set search_path = public
as $$
  with sueltos as (
    update public.trabajos
    set estado = 'pendiente',
        trabajador = null,
        tomado_en = null,
        no_antes_de = now()
    where estado = 'en_curso'
      and tomado_en < now() - make_interval(mins => greatest(coalesce(p_minutos, 15), 1))
    returning 1
  )
  select coalesce(count(*), 0)::integer from sueltos;
$$;

alter table public.trabajos enable row level security;

-- Ninguna política: nadie entra por la puerta pública. Solo la clave de
-- servicio, que lleva BYPASSRLS, igual que el resto de tablas.
revoke all on table public.trabajos from public, anon, authenticated;
revoke all on sequence public.trabajos_id_seq from public, anon, authenticated;

revoke all on function public.tomar_trabajos(integer, text)      from public, anon, authenticated;
revoke all on function public.rescatar_trabajos_colgados(integer) from public, anon, authenticated;
grant execute on function public.tomar_trabajos(integer, text)      to service_role;
grant execute on function public.rescatar_trabajos_colgados(integer) to service_role;;
