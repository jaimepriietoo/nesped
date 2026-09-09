-- Fase 3: cortacircuitos por proveedor externo.
-- Aplicado en producción el 2026-09-09.
--
-- Nesped depende de cuatro empresas que se caen: Resend para el correo,
-- Telnyx para el teléfono, OpenAI para la conversación y Stripe para el cobro.
-- Cuando una falla, hoy pasa lo peor posible: se reintenta. La cola reintenta,
-- los automatismos reintentan, y cada reintento es una petición más contra un
-- servicio que ya está de rodillas, facturada igual que si hubiera funcionado.
--
-- El estado vive aquí y no en memoria a propósito. En Vercel cada petición es
-- un proceso nuevo: un contador en memoria empieza en cero cada vez y nunca
-- llega al umbral. Un cortacircuitos que no puede contar no existe.

create table if not exists public.cortacircuitos (
  proveedor         text primary key,
  fallos_seguidos   integer     not null default 0,
  -- Null = cerrado, se puede llamar.
  abierto_hasta     timestamptz,
  -- No sirve para decidir en caliente; sirve para mirar dentro de un mes qué
  -- proveedor da guerra.
  aperturas         integer     not null default 0,
  ultimo_error      text,
  ultimo_fallo_en   timestamptz,
  ultimo_acierto_en timestamptz,
  actualizado_en    timestamptz not null default now()
);

-- El contador tiene que ser atómico. Varias peticiones fallando a la vez
-- —que es exactamente lo que pasa cuando un proveedor se cae— harían
-- leer-sumar-escribir cada una por su lado y perderían cuentas justo cuando
-- más falta hacen.
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

  -- Se dobla por cada apertura seguida, con techo de una hora. Sin techo, un
  -- proveedor con un mal día quedaría apagado hasta mañana.
  v_espera := least(
    greatest(coalesce(p_espera, 60), 1) * power(2, least(v_fila.aperturas, 6))::integer,
    3600
  );

  update public.cortacircuitos
  set abierto_hasta  = now() + make_interval(secs => v_espera),
      aperturas      = aperturas + 1,
      actualizado_en = now()
  where proveedor = p_proveedor
  returning * into v_fila;

  return jsonb_build_object(
    'abierto', true, 'fallos', v_fila.fallos_seguidos,
    'segundos', v_espera, 'hasta', v_fila.abierto_hasta
  );
end;
$$;

-- Las aperturas se olvidan sólo si hacía un rato que no había ninguna. Si no,
-- un proveedor que va y viene cada minuto reiniciaría la escalada cada vez y
-- no se le dejaría nunca en paz.
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
grant execute on function public.anotar_acierto_proveedor(text)                        to service_role;
