-- Cierra la puerta pública a la base de datos.
--
-- Aplicada en producción el 2026-09-09. Se guarda aquí para que el esquema no
-- viva sólo dentro de Supabase: si algún día hay un segundo entorno, esto
-- tiene que ir con él o nacerá abierto.
--
-- ESTADO DEL QUE SE PARTÍA
-- RLS activado en las 17 tablas y CERO políticas, que en Postgres ya deniega
-- todo. Comprobado atacando con la clave pública: 0 filas, altas rechazadas
-- con 42501, nada borrado.
--
-- POR QUÉ NO BASTABA
-- RLS era lo ÚNICO que sujetaba la puerta. Los roles anon y authenticated
-- conservaban permisos de SELECT, INSERT, UPDATE y DELETE sobre todo. Una
-- sola política permisiva —el panel de Supabase ofrece "Enable read access
-- for all users" a un clic— y queda abierto de par en par sin tocar código.
--
-- Esta aplicación nunca habla con la base de datos desde el navegador: todo
-- pasa por el servidor con la clave de servicio, que lleva BYPASSRLS. El
-- acceso público no es que deba estar restringido, es que no debe existir.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;

-- Las tablas futuras nacen cerradas. Sin esto, la próxima que se cree vuelve
-- a salir con permisos para anon y el agujero reaparece sin que nadie lo vea.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Política restrictiva por tabla: el cinturón además de los tirantes.
-- Las permisivas se suman con OR; las restrictivas se cruzan con AND, así que
-- una restrictiva a false gana aunque alguien añada una permisiva por error.
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force row level security', t.relname);
    execute format('drop policy if exists %I on public.%I', 'sin_acceso_publico', t.relname);
    execute format(
      'create policy %I on public.%I as restrictive to anon, authenticated using (false) with check (false)',
      'sin_acceso_publico', t.relname);
  end loop;
end $$;

-- LAS FUNCIONES, QUE ERAN EL AGUJERO DE VERDAD
--
-- Se podían llamar desde fuera, y revocárselo a anon no servía de nada: el
-- permiso no estaba concedido a anon sino a PUBLIC, que incluye a todo el
-- mundo. Es el comportamiento por defecto de Postgres al crear una función y
-- es la trampa clásica: se revoca a los roles que uno tiene en la cabeza, se
-- consulta has_function_privilege('anon', ...), sigue diciendo true, y no se
-- entiende por qué.
--
-- Comprobado antes del cambio: calculate_lead_score() devolvía un número con
-- la clave pública. No filtraba datos, pero create_lead_event() inserta, y lo
-- único que impedía la escritura era RLS.
--
-- postgres y service_role tienen permiso explícito propio, así que
-- quitárselo a PUBLIC no les afecta.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

comment on schema public is
  'Solo accesible desde el servidor de Nesped con la clave de servicio. Los roles anon y authenticated no tienen permisos ni pueden tenerlos: hay una política restrictiva por tabla que lo impide aunque se conceda un GRANT por error.';
