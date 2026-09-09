-- Fase 5: sacar y mover una empresa entera.
-- Aplicado en producción el 2026-09-09.
--
-- POR QUÉ ESTO Y NO UNA CAPA DE ENRUTADO.
--
-- La hoja de ruta pedía "repartir por fragmentos según empresa" para cuando
-- haya 200.000 empresas. Hoy hay cinco. Montar ahora una capa de enrutado
-- sería complicar el producto entero a cambio de nada.
--
-- Pero repartir por fragmentos NO es una capa de enrutado: es poder coger una
-- empresa y ponerla en otro sitio. Si eso se puede hacer limpiamente,
-- repartir es hacerlo muchas veces. Si no se puede, ninguna capa de enrutado
-- lo arregla. Y esa capacidad hace falta hoy por tres motivos que no tienen
-- nada que ver con crecer:
--
--   · El RGPD da derecho a la portabilidad de los datos.
--   · Cuando un cliente se va, hay que entregárselos y borrarlos.
--   · Y para saber si algo se puede repartir, hay que intentarlo una vez.
--
-- LO QUE SALIÓ AL ESCRIBIRLO. La lista de tablas de empresa del código tenía
-- veinte entradas y la base tiene veinticuatro. Faltaban `users` —donde viven
-- las cuentas—, `grabaciones_pendientes` y los dos archivos de la fase 3. Una
-- ruta que consultara `users` sin filtrar habría enseñado las cuentas de todas
-- las empresas, y la prueba de aislamiento no habría dicho nada, porque esa
-- prueba sólo mira las tablas que le declaran.
--
-- Por eso aquí la lista sale del catálogo y no de la memoria de nadie.

/**
 * Qué tablas son de una empresa, según la propia base de datos.
 *
 * Una lista escrita a mano se queda vieja en cuanto alguien añade una tabla, y
 * no avisa: sencillamente deja de proteger y deja de exportar lo nuevo.
 */
create or replace function public.tablas_de_empresa()
returns table (tabla text, columna text)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text, 'client_id'::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'client_id'
        and a.attnum > 0 and not a.attisdropped
    )
  union all
  -- En clients la empresa ES la fila, así que se ata por id.
  select 'clients'::text, 'id'::text
  order by 1;
$$;

/**
 * El inventario de lo que tiene una empresa.
 *
 * Se pide primero para saber qué hay antes de sacarlo, para poder enseñar un
 * progreso, y para poder comprobar al terminar que lo sacado cuadra con lo que
 * había. Sin esa comprobación, una exportación incompleta se entrega igual.
 */
create or replace function public.inventario_de_empresa(p_client_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fila   record;
  v_n      bigint;
  v_total  bigint := 0;
  v_partes jsonb := '{}'::jsonb;
begin
  if p_client_id is null or p_client_id = '' then
    raise exception 'Hace falta decir de qué empresa';
  end if;

  for v_fila in select tabla, columna from public.tablas_de_empresa() loop
    execute format('select count(*) from public.%I where %I = $1', v_fila.tabla, v_fila.columna)
      into v_n using p_client_id;

    if v_n > 0 then
      v_partes := v_partes || jsonb_build_object(v_fila.tabla, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  return jsonb_build_object(
    'empresa', p_client_id,
    'existe',  exists (select 1 from public.clients where id = p_client_id),
    'filas',   v_partes,
    'total',   v_total
  );
end;
$$;

/**
 * Las filas de UNA tabla de UNA empresa.
 *
 * Va tabla a tabla y con paginación a propósito. Una empresa grande puede
 * tener cientos de miles de filas, y devolverlo todo en un solo jsonb es
 * pedirle a Postgres que construya en memoria un documento de cientos de
 * megabytes: justo el fallo que las fases 0 a 3 vinieron a quitar.
 *
 * El nombre de la tabla se comprueba contra el catálogo antes de meterlo en el
 * SQL. Aunque esto sólo lo puede ejecutar service_role, un nombre de tabla que
 * viene de fuera y acaba concatenado en una consulta es la forma exacta de un
 * fallo grave, y cerrarlo no cuesta nada.
 */
create or replace function public.exportar_tabla_de_empresa(
  p_client_id text,
  p_tabla     text,
  p_limite    integer default 1000,
  p_desde     integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_columna text;
  v_filas   jsonb;
begin
  select columna into v_columna from public.tablas_de_empresa() where tabla = p_tabla;

  if v_columna is null then
    raise exception 'La tabla % no es de empresa, o no existe', p_tabla;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       from (select * from public.%I where %I = $1 order by 1 limit $2 offset $3) t',
    p_tabla, v_columna
  ) into v_filas
  using p_client_id,
        least(greatest(coalesce(p_limite, 1000), 1), 5000),
        greatest(coalesce(p_desde, 0), 0);

  return v_filas;
end;
$$;

/**
 * ¿Hay filas de una empresa que apunten a filas de otra?
 *
 * Es la pregunta que decide si una empresa se puede mover sola, y por tanto si
 * repartir por fragmentos es posible algún día. Si una alerta de la empresa A
 * apunta a una llamada de la empresa B, al llevarte A la referencia se queda
 * huérfana y te has llevado media cosa.
 *
 * Pero además es una comprobación de aislamiento a secas, y esa vale hoy: un
 * enlace que cruza empresas casi siempre quiere decir que alguien escribió una
 * fila sin filtrar, o sea una fuga.
 *
 * Se deriva de las claves ajenas del catálogo. Una lista escrita a mano deja
 * de comprobar en silencio en cuanto alguien añade una relación.
 *
 * Comprobado el 2026-09-09: cero cruces, y comprobado también que DETECTA uno
 * plantando un evento de una empresa apuntando al contacto de otra. Con la
 * advertencia honesta de que sólo había 7 enlaces reales que mirar.
 */
create or replace function public.referencias_que_cruzan_empresas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fk      record;
  v_cruzan  bigint;
  v_enlaces bigint;
  v_salida  jsonb := '[]'::jsonb;
  v_total   bigint := 0;
begin
  for v_fk in
    select
      hijo.relname::text  as tabla_hija,
      att_h.attname::text as columna_hija,
      padre.relname::text as tabla_padre,
      att_p.attname::text as columna_padre
    from pg_constraint con
    join pg_class hijo  on hijo.oid  = con.conrelid
    join pg_class padre on padre.oid = con.confrelid
    join pg_attribute att_h on att_h.attrelid = con.conrelid  and att_h.attnum = con.conkey[1]
    join pg_attribute att_p on att_p.attrelid = con.confrelid and att_p.attnum = con.confkey[1]
    where con.contype = 'f'
      and con.connamespace = 'public'::regnamespace
      -- Sólo las que unen dos tablas que TIENEN empresa. Una clave ajena a
      -- clients no cruza nada: es la que define de qué empresa es la fila.
      and exists (select 1 from pg_attribute a where a.attrelid = con.conrelid
                    and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = con.confrelid
                    and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped)
  loop
    execute format(
      'select count(*) filter (where h.client_id is distinct from p.client_id), count(*)
         from public.%I h join public.%I p on p.%I = h.%I',
      v_fk.tabla_hija, v_fk.tabla_padre, v_fk.columna_padre, v_fk.columna_hija
    ) into v_cruzan, v_enlaces;

    v_total := v_total + v_cruzan;
    v_salida := v_salida || jsonb_build_object(
      'referencia', v_fk.tabla_hija || '.' || v_fk.columna_hija || ' → ' || v_fk.tabla_padre,
      'enlaces',    v_enlaces,
      'cruzan',     v_cruzan
    );
  end loop;

  return jsonb_build_object(
    'relaciones', v_salida,
    'cruces',     v_total,
    -- Sin enlaces, la comprobación no ha comprobado nada. Decirlo evita que un
    -- "cero cruces" con la base vacía se lea como una garantía.
    'enlaces_mirados', (select coalesce(sum((r->>'enlaces')::bigint), 0)
                        from jsonb_array_elements(v_salida) r),
    'limpio', v_total = 0
  );
end;
$$;

revoke all on function public.tablas_de_empresa()                from public, anon, authenticated;
revoke all on function public.inventario_de_empresa(text)        from public, anon, authenticated;
revoke all on function public.referencias_que_cruzan_empresas()  from public, anon, authenticated;
revoke all on function public.exportar_tabla_de_empresa(text, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.tablas_de_empresa()               to service_role;
grant execute on function public.inventario_de_empresa(text)       to service_role;
grant execute on function public.referencias_que_cruzan_empresas() to service_role;
grant execute on function public.exportar_tabla_de_empresa(text, text, integer, integer)
  to service_role;
