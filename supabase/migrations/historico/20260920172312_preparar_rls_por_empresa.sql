-- Prepara el acceso del portal con mínimo privilegio y RLS por empresa.
--
-- POR QUÉ. El servidor usa service_role, que tiene BYPASSRLS. El envoltorio
-- de JavaScript añade client_id, pero un olvido en código todavía podría leer
-- otra empresa. `nesped_app` no puede saltarse RLS y Postgres vuelve a hacer
-- la comprobación aunque una consulta omita el filtro.
--
-- DESPLIEGUE SIN CORTE. Esta migración no retira permisos a service_role ni
-- cambia el tráfico actual. Crea el rol, el contexto y políticas PERMISSIVE;
-- el código sólo adopta el rol cuando NESPED_RLS_PORTAL=obligatorio. La
-- migración siguiente activa FORCE RLS después de la prueba cruzada.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nesped_app') then
    create role nesped_app
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  else
    alter role nesped_app
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;

-- PostgREST conecta como authenticator y adopta el rol del JWT. nesped_app
-- sigue siendo NOLOGIN: no existe contraseña ni cadena de conexión para él.
grant nesped_app to authenticator;
grant usage on schema public to nesped_app;

-- Defensa explícita aunque el rol se hubiese creado manualmente antes. Estas
-- revocaciones no afectan a los roles gestionados por Supabase.
do $$
declare
  v_esquema text;
begin
  foreach v_esquema in array array['auth', 'storage', 'supabase_migrations']
  loop
    if exists (select 1 from pg_namespace where nspname = v_esquema) then
      execute format('revoke all privileges on all tables in schema %I from nesped_app', v_esquema);
      execute format('revoke all privileges on all sequences in schema %I from nesped_app', v_esquema);
      execute format('revoke all privileges on all functions in schema %I from nesped_app', v_esquema);
      execute format('revoke usage on schema %I from nesped_app', v_esquema);
    end if;
  end loop;
end
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

/**
 * PostgREST llama esta función al comenzar CADA operación de base de datos.
 * El ajuste es local a la transacción (`true`), así que nunca puede filtrarse
 * a la siguiente petición cuando Supavisor reutiliza una conexión.
 */
create or replace function private.fijar_contexto_nesped()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_empresa text;
begin
  if current_user <> 'nesped_app' then
    return;
  end if;

  v_empresa := nullif(trim(v_claims ->> 'client_id'), '');
  if v_empresa is null or length(v_empresa) > 200
     or v_empresa !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Falta el contexto de empresa' using errcode = '42501';
  end if;

  perform set_config('app.client_id', v_empresa, true);
  -- No se escribe el identificador: queda constancia de la adopción del rol
  -- sin añadir nombres de empresas ni datos personales a los logs de Postgres.
  raise log 'nesped_rls_context role=nesped_app client_id_set=true';
end;
$$;

revoke all on function private.fijar_contexto_nesped() from public;
grant usage on schema private to service_role, nesped_app;
grant execute on function private.fijar_contexto_nesped()
  to service_role, nesped_app;

alter role authenticator
  set pgrst.db_pre_request = 'private.fijar_contexto_nesped';

-- Las tablas de empresa se descubren desde el catálogo para que una tabla ya
-- existente no quede fuera por una lista manual desactualizada.
do $$
declare
  v_tabla record;
  v_secuencia record;
begin
  for v_tabla in
    select c.relname as tabla, 'client_id'::text as columna
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'client_id'
          and a.attnum > 0
          and not a.attisdropped
      )
    union all
    select 'clients', 'id'
    where to_regclass('public.clients') is not null
  loop
    execute format('alter table public.%I enable row level security', v_tabla.tabla);
    execute format('revoke all on table public.%I from nesped_app', v_tabla.tabla);

    if v_tabla.tabla = 'clients' then
      execute format('grant select, update on table public.%I to nesped_app', v_tabla.tabla);
    else
      execute format(
        'grant select, insert, update, delete on table public.%I to nesped_app',
        v_tabla.tabla
      );
    end if;

    execute format(
      'drop policy if exists nesped_aislamiento_empresa on public.%I',
      v_tabla.tabla
    );
    execute format(
      'create policy nesped_aislamiento_empresa on public.%I '
      'as permissive for all to nesped_app '
      'using ((select current_setting(''app.client_id'', true)) = %I::text) '
      'with check ((select current_setting(''app.client_id'', true)) = %I::text)',
      v_tabla.tabla,
      v_tabla.columna,
      v_tabla.columna
    );
  end loop;

  -- Sólo las secuencias que alimentan tablas de empresa. Sin USAGE, un
  -- INSERT legítimo en una columna identity/serial fallaría antes de RLS.
  for v_secuencia in
    select distinct sec.relname as secuencia
    from pg_class tabla
    join pg_namespace nt on nt.oid = tabla.relnamespace and nt.nspname = 'public'
    join pg_attribute a on a.attrelid = tabla.oid and a.attnum > 0 and not a.attisdropped
    join pg_depend d on d.refobjid = tabla.oid and d.refobjsubid = a.attnum
    join pg_class sec on sec.oid = d.objid and sec.relkind = 'S'
    where exists (
      select 1 from pg_attribute empresa
      where empresa.attrelid = tabla.oid
        and empresa.attname = 'client_id'
        and empresa.attnum > 0
        and not empresa.attisdropped
    )
  loop
    execute format('grant usage, select on sequence public.%I to nesped_app', v_secuencia.secuencia);
  end loop;
end
$$;

-- Catálogos y estado global que el portal sólo necesita leer. No se concede
-- escritura ni acceso a auth.*, storage.* o supabase_migrations.*.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'products',
    'industry_playbooks',
    'ajustes_plataforma',
    'cortacircuitos'
  ]
  loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('revoke all on table public.%I from nesped_app', v_tabla);
      execute format('grant select on table public.%I to nesped_app', v_tabla);
      execute format('drop policy if exists nesped_catalogo_lectura on public.%I', v_tabla);
      execute format(
        'create policy nesped_catalogo_lectura on public.%I '
        'as permissive for select to nesped_app using (true)',
        v_tabla
      );
    end if;
  end loop;
end
$$;

-- Las variantes sin empresa son plantillas de plataforma, no datos de otra
-- empresa. Se pueden leer, nunca escribir, además de las propias.
do $$
begin
  if to_regclass('public.message_variants') is not null then
    drop policy if exists nesped_variantes_globales on public.message_variants;
    create policy nesped_variantes_globales
      on public.message_variants
      as permissive for select to nesped_app
      using (client_id is null);
  end if;
end
$$;

-- RPC usados por el portal. Todos son SECURITY INVOKER: las consultas que
-- ejecutan vuelven a pasar por las mismas políticas RLS del llamante.
do $$
declare
  v_funcion text;
begin
  foreach v_funcion in array array[
    'public.resumen_portal(text)',
    'public.consumo_del_mes(text)',
    'public.gasto_ia_del_dia(text)',
    'public.revocar_sesiones_usuario(text)',
    'public.gestionar_usuario_portal(text,text,text,uuid,text,text,text,text,boolean,text)'
  ]
  loop
    if to_regprocedure(v_funcion) is not null then
      execute format('grant execute on function %s to nesped_app', v_funcion);
    end if;
  end loop;
end
$$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';;
