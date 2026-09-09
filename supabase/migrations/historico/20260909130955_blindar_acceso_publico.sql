-- Cierra la puerta pública a la base de datos.
--
-- Estado del que se parte: RLS activado en las 17 tablas y CERO políticas.
-- En Postgres eso ya deniega todo, y se comprobó atacando con la clave
-- pública: 0 filas leídas, altas rechazadas con 42501, nada borrado.
--
-- El problema no es lo que pasa hoy, es lo frágil que es. RLS era lo ÚNICO
-- que sujetaba la puerta: los roles anon y authenticated conservaban permisos
-- de SELECT, INSERT, UPDATE y DELETE sobre todas las tablas. Basta con que
-- alguien añada una política permisiva —el panel de Supabase ofrece "Enable
-- read access for all users" a un clic— para que quede abierto de par en par
-- sin que nadie toque una línea de código.
--
-- Esta aplicación nunca habla con la base de datos desde el navegador: todo
-- pasa por el servidor con la clave de servicio, que lleva BYPASSRLS. Así que
-- el acceso público no es que esté restringido, es que no debería existir.
-- Esto lo escribe explícitamente en tres capas.

-- ── 1. Sin permisos de tabla ────────────────────────────────────────────
-- Aunque mañana aparezca una política permisiva, sin GRANT no hay acceso.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;

-- ── 2. Las tablas futuras nacen cerradas ────────────────────────────────
-- Sin esto, la próxima tabla que se cree vuelve a salir con permisos para
-- anon, y el agujero reaparece sin que nadie se dé cuenta.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ── 3. Política restrictiva: el cinturón además de los tirantes ─────────
-- Las políticas permisivas se suman con OR; las restrictivas se cruzan con
-- AND. Una restrictiva a false gana siempre, así que aunque alguien añada
-- una permisiva por error, sigue sin pasar nadie.
--
-- service_role tiene BYPASSRLS: la aplicación no se entera de nada de esto.
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
    execute format('drop policy if exists %I on public.%I',
                   'sin_acceso_publico', t.relname);
    execute format(
      'create policy %I on public.%I as restrictive to anon, authenticated using (false) with check (false)',
      'sin_acceso_publico', t.relname);
  end loop;
end $$;

comment on schema public is
  'Solo accesible desde el servidor de Nesped con la clave de servicio. Los roles anon y authenticated no tienen permisos ni pueden tenerlos: hay una política restrictiva por tabla que lo impide aunque se conceda un GRANT por error.';;
