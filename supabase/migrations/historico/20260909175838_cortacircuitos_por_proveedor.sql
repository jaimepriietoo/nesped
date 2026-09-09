-- Cortacircuitos por proveedor externo.
--
-- Nesped depende de cuatro empresas que se caen: Resend para el correo,
-- Telnyx para el teléfono, OpenAI para la conversación y Stripe para el cobro.
-- Cuando una de ellas falla, hoy pasa lo peor posible: se reintenta. La cola
-- reintenta, los automatismos reintentan, y cada reintento es una petición más
-- contra un servicio que ya está de rodillas, facturada igual que si hubiera
-- funcionado.
--
-- Un cortacircuitos cuenta los fallos seguidos y, pasado un número, deja de
-- llamar durante un rato. No arregla la caída: evita que la caída de otro se
-- convierta en la factura de uno y en una cola que no avanza.
--
-- El estado vive en la base de datos y no en memoria a propósito. En Vercel
-- cada petición es un proceso nuevo: un contador en memoria empieza en cero
-- cada vez y nunca llega al umbral. Un cortacircuitos que no puede contar es
-- un cortacircuitos que no existe.

create table if not exists public.cortacircuitos (
  proveedor       text primary key,

  -- Fallos seguidos desde el último acierto.
  fallos_seguidos integer     not null default 0,

  -- Hasta cuándo no se vuelve a llamar. Null = cerrado, se puede llamar.
  abierto_hasta   timestamptz,

  -- Cuántas veces se ha abierto en total. No sirve para decidir nada en
  -- caliente; sirve para mirar dentro de un mes qué proveedor da guerra.
  aperturas       integer     not null default 0,

  ultimo_error    text,
  ultimo_fallo_en timestamptz,
  ultimo_acierto_en timestamptz,
  actualizado_en  timestamptz not null default now()
);

/**
 * Anota un fallo y decide si hay que abrir.
 *
 * Va en una función y no en la aplicación porque el contador tiene que ser
 * atómico. Varias peticiones fallando a la vez —que es exactamente lo que pasa
 * cuando un proveedor se cae— harían leer-sumar-escribir cada una por su lado
 * y perderían cuentas justo cuando más falta hacen.
 *
 * La espera crece con cada apertura seguida: un proveedor que lleva media hora
 * caído no mejora porque se le pregunte cada treinta segundos.
 */
create or replace function public.anotar_fallo_proveedor(
  p_proveedor text,
  p_error     text,
  p_umbral    integer default 5,
  p_espera    integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila   public.cortacircuitos;
  v_espera integer;
begin
  insert into public.cortacircuitos (proveedor, fallos_seguidos, ultimo_error, ultimo_fallo_en, actualizado_en)
  values (p_proveedor, 1, left(coalesce(p_error, ''), 500), now(), now())
  on conflict (proveedor) do update
    set fallos_seguidos = public.cortacircuitos.fallos_seguidos + 1,
        ultimo_error    = left(coalesce(p_error, ''), 500),
        ultimo_fallo_en = now(),
        actualizado_en  = now()
  returning * into v_fila;

  if v_fila.fallos_seguidos < greatest(coalesce(p_umbral, 5), 1) then
    return jsonb_build_object('abierto', false, 'fallos', v_fila.fallos_seguidos);
  end if;

  -- Se dobla la espera por cada apertura seguida, con techo de una hora. Sin
  -- techo, un proveedor con un mal día quedaría apagado hasta mañana.
  v_espera := least(
    greatest(coalesce(p_espera, 60), 1) * power(2, least(v_fila.aperturas, 6))::integer,
    3600
  );

  update public.cortacircuitos
  set abierto_hasta = now() + make_interval(secs => v_espera),
      aperturas     = aperturas + 1,
      actualizado_en = now()
  where proveedor = p_proveedor
  returning * into v_fila;

  return jsonb_build_object(
    'abierto', true,
    'fallos', v_fila.fallos_seguidos,
    'segundos', v_espera,
    'hasta', v_fila.abierto_hasta
  );
end;
$$;

/**
 * Anota un acierto: cierra el circuito y pone el contador a cero.
 *
 * Las aperturas también se olvidan, pero sólo si hacía un rato que no había
 * ninguna. Si no, un proveedor que va y viene cada minuto reiniciaría la
 * escalada de espera cada vez y no se le dejaría nunca en paz.
 */
create or replace function public.anotar_acierto_proveedor(p_proveedor text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.cortacircuitos (proveedor, fallos_seguidos, ultimo_acierto_en, actualizado_en)
  values (p_proveedor, 0, now(), now())
  on conflict (proveedor) do update
    set fallos_seguidos   = 0,
        abierto_hasta     = null,
        ultimo_error      = null,
        ultimo_acierto_en = now(),
        actualizado_en    = now(),
        aperturas = case
          when public.cortacircuitos.ultimo_fallo_en is null
            or public.cortacircuitos.ultimo_fallo_en < now() - interval '30 minutes'
          then 0
          else public.cortacircuitos.aperturas
        end;
$$;

alter table public.cortacircuitos enable row level security;

revoke all on table public.cortacircuitos from public, anon, authenticated;
revoke all on function public.anotar_fallo_proveedor(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.anotar_acierto_proveedor(text)                        from public, anon, authenticated;
grant execute on function public.anotar_fallo_proveedor(text, text, integer, integer) to service_role;
grant execute on function public.anotar_acierto_proveedor(text)                        to service_role;;
