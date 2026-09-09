-- Permite volcar al repositorio el SQL de las migraciones ya aplicadas.
--
-- POR QUÉ HACE FALTA. Los ficheros de supabase/migrations/ de las fases 0 y 1
-- son sólo prosa: explican qué se hizo y por qué, pero no llevan el DDL. Eso
-- significa que este repositorio NO puede reconstruir la base de datos. Si
-- mañana hiciera falta un segundo entorno, o hubiera que recuperar el proyecto
-- desde cero, la forma de la base de datos existe en un solo sitio.
--
-- Un esquema que vive únicamente dentro del proveedor es una dependencia que
-- no se ve hasta el día que se necesita.
--
-- Sólo la puede ejecutar service_role. Devuelve DDL, que no es secreto —está
-- destinado al repositorio— pero tampoco tiene por qué ser público.
create or replace function public.exportar_migraciones()
returns table (version text, name text, sql text)
language sql
security definer
set search_path = ''
as $$
  select m.version,
         coalesce(m.name, ''),
         array_to_string(m.statements, E';\n\n') || ';'
  from supabase_migrations.schema_migrations m
  order by m.version
$$;

revoke all on function public.exportar_migraciones() from public, anon, authenticated;
grant execute on function public.exportar_migraciones() to service_role;

notify pgrst, 'reload schema';;
