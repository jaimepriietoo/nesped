-- Una sola pasada de la cola a la vez.
--
-- POR QUÉ. El latido de Supabase (pg_cron + pg_net) llama a
-- /api/cola/procesar cada 30 segundos pase lo que pase. El de Railway no:
-- esperaba a que terminara la pasada anterior. El 28 y el 29-09-2026 la base
-- se quedó sin memoria y cada pasada se colgaba hasta 300 s esperándola; con
-- una nueva cada 30 s llegó a haber diez a la vez tirando de una base que ya
-- no podía más. No fueron la causa, pero sí lo que convierte un rato lento en
-- un atasco.
--
-- QUÉ HACE. Añade a la fila única de ajustes_plataforma un turno con fecha de
-- caducidad y dos funciones:
--   · tomar_turno_cola(p_por, p_segundos): lo toma si está libre o caducado,
--     en una sola sentencia, así que dos pasadas nunca lo toman a la vez.
--   · soltar_turno_cola(p_por): lo suelta, sólo si lo tiene quien lo pide.
-- Si una pasada muere sin soltarlo, caduca solo: nunca bloquea la cola más
-- que el tiempo pedido (la ruta pide 150 s y se corta a los 120).
--
-- Aditiva. Sin estas funciones la ruta sigue procesando como antes: si no
-- puede pedir turno, pasa igualmente (dos pasadas a la vez no duplican
-- trabajo; lo que no puede pasar es que la cola se pare).
--
-- VUELTA ATRÁS. No hace falta: basta con volver al código anterior. Para
-- liberar un turno a mano:
--   update public.ajustes_plataforma set cola_ocupada_hasta = null, cola_ocupada_por = null where id = 'plataforma';

alter table public.ajustes_plataforma
  add column if not exists cola_ocupada_hasta timestamptz,
  add column if not exists cola_ocupada_por text;

insert into public.ajustes_plataforma (id) values ('plataforma')
on conflict (id) do nothing;

create or replace function public.tomar_turno_cola(p_por text, p_segundos integer default 150)
returns boolean
language sql
security definer
set search_path = public
as $$
  with tomado as (
    update public.ajustes_plataforma
       set cola_ocupada_hasta = now() + make_interval(secs => least(greatest(coalesce(p_segundos, 150), 30), 600)),
           cola_ocupada_por = left(coalesce(p_por, ''), 100)
     where id = 'plataforma'
       and (cola_ocupada_hasta is null or cola_ocupada_hasta < now())
    returning 1
  )
  select exists (select 1 from tomado);
$$;

create or replace function public.soltar_turno_cola(p_por text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ajustes_plataforma
     set cola_ocupada_hasta = null,
         cola_ocupada_por = null
   where id = 'plataforma'
     and cola_ocupada_por = left(coalesce(p_por, ''), 100);
$$;

revoke all on function public.tomar_turno_cola(text, integer) from public, anon, authenticated;
revoke all on function public.soltar_turno_cola(text) from public, anon, authenticated;
grant execute on function public.tomar_turno_cola(text, integer) to service_role;
grant execute on function public.soltar_turno_cola(text) to service_role;

notify pgrst, 'reload schema';
