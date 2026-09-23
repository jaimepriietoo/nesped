-- Segunda fase del aislamiento por empresa.
--
-- Aplicar sólo después de:
--   1. aplicar 20260920183000_preparar_rls_por_empresa.sql;
--   2. desplegar con NESPED_RLS_PORTAL=obligatorio en un entorno de prueba;
--   3. ejecutar la prueba cruzada y recorrer el portal.
--
-- FORCE hace que ni siquiera el propietario de una tabla pueda ignorar RLS.
-- service_role conserva BYPASSRLS para cron, webhooks y administración; el
-- tráfico normal del portal nunca usa ese rol una vez activado el modo.

do $$
declare
  v_tabla record;
begin
  for v_tabla in
    select c.relname as tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        c.relname = 'clients'
        or exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid
            and a.attname = 'client_id'
            and a.attnum > 0
            and not a.attisdropped
        )
      )
  loop
    execute format('alter table public.%I enable row level security', v_tabla.tabla);
    execute format('alter table public.%I force row level security', v_tabla.tabla);
  end loop;
end
$$;

notify pgrst, 'reload schema';;
