-- Códigos de recuperación para el segundo factor.
--
-- Hoy el segundo factor va por correo, y si el correo no sale nadie entra. El
-- código ya tenía un respaldo por SMS, pero comprobado en producción no puede
-- dispararse: ninguno de los seis usuarios tiene móvil guardado y Telnyx no
-- tiene número desde el que enviar. O sea que el respaldo existe en el código
-- y no existe en la realidad.
--
-- Un proveedor de correo caído dejando fuera de su propia plataforma a todos
-- los clientes es una dependencia mal colocada, y añadir un segundo proveedor
-- sólo mueve el problema: también se cae.
--
-- Estos códigos no dependen de nadie. Se generan una vez, se enseñan una vez,
-- y quien los guarda puede entrar aunque no funcione ningún envío.
create table if not exists public.codigos_recuperacion (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  client_id   text references public.clients(id) on delete cascade,
  -- Se guarda el hash, nunca el código. Si alguien lee esta tabla no obtiene
  -- una llave: obtiene lo mismo que obtendría leyendo las contraseñas.
  hash        text not null,
  usado_en    timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists codigos_recuperacion_email_idx
  on public.codigos_recuperacion (email) where usado_en is null;

comment on table public.codigos_recuperacion is
  'Códigos de un solo uso para entrar cuando el segundo factor por correo no funciona. Se guarda el hash con el mismo algoritmo que las contraseñas.';

revoke all on public.codigos_recuperacion from anon, authenticated;
alter table public.codigos_recuperacion enable row level security;
alter table public.codigos_recuperacion force row level security;
drop policy if exists sin_acceso_publico on public.codigos_recuperacion;
create policy sin_acceso_publico on public.codigos_recuperacion
  as restrictive to anon, authenticated using (false) with check (false);;
