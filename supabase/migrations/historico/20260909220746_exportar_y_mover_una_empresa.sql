-- Sacar y mover una empresa entera.
--
-- POR QUÉ AHORA, CON CINCO CLIENTES.
--
-- La hoja de ruta pedía "repartir por fragmentos según empresa" para cuando
-- haya 200.000. Montar hoy una capa de enrutado para cinco clientes sería
-- complicar el producto a cambio de nada.
--
-- Pero repartir por fragmentos NO es una capa de enrutado: es poder coger una
-- empresa y ponerla en otro sitio. Si eso se puede hacer limpiamente, repartir
-- es hacerlo muchas veces. Si no se puede, ninguna capa de enrutado lo
-- arregla.
--
-- Y esa capacidad hace falta hoy, por tres motivos que no tienen nada que ver
-- con escalar:
--
--   · El RGPD da derecho a la portabilidad de los datos. Un cliente puede
--     pedir los suyos y hay que dárselos.
--   · Cuando un cliente se va, hay que poder entregárselos y borrarlos.
--   · Y para saber si algo se puede repartir, hay que intentarlo una vez.
--
-- LO QUE ESTO ENSEÑA DE PROPINA. La lista de tablas sale del catálogo, no de
-- una lista escrita a mano. Comprobado al escribirla: había cuatro tablas con
-- client_id que la lista del código no vigilaba, y una era `users`, donde
-- viven las cuentas.

/**
 * Qué tablas son de una empresa, según la propia base de datos.
 *
 * Se saca del catálogo a propósito. Una lista escrita a mano se queda vieja
 * en cuanto alguien añade una tabla, y no avisa: sencillamente deja de
 * proteger y deja de exportar lo nuevo.
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
      where a.attrelid = c.oid and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
    )
  union all
  -- En clients la empresa ES la fila, así que se ata por id.
  select 'clients'::text, 'id'::text
  order by 1;
$$;

/**
 * El inventario de lo que tiene una empresa.
 *
 * Se pide primero para saber qué hay antes de sacarlo. Devuelve cuántas filas
 * hay en cada tabla, para poder enseñar un progreso y para poder comprobar
 * después que lo movido cuadra con lo que había.
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
 * megabytes. Quien exporta recorre el inventario y pide por trozos.
 *
 * El nombre de la tabla se comprueba contra el catálogo antes de meterlo en el
 * SQL. Aunque esta función sólo la puede ejecutar service_role, un nombre de
 * tabla que viene de fuera y acaba concatenado en una consulta es exactamente
 * la forma de un fallo grave, y no cuesta nada cerrarlo.
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
  select columna into v_columna
  from public.tablas_de_empresa() where tabla = p_tabla;

  if v_columna is null then
    raise exception 'La tabla % no es de empresa, o no existe', p_tabla;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       from (select * from public.%I where %I = $1 order by 1 limit $2 offset $3) t',
    p_tabla, v_columna
  ) into v_filas using p_client_id, least(greatest(coalesce(p_limite, 1000), 1), 5000), greatest(coalesce(p_desde, 0), 0);

  return v_filas;
end;
$$;

revoke all on function public.tablas_de_empresa()                             from public, anon, authenticated;
revoke all on function public.inventario_de_empresa(text)                     from public, anon, authenticated;
revoke all on function public.exportar_tabla_de_empresa(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.tablas_de_empresa()                             to service_role;
grant execute on function public.inventario_de_empresa(text)                     to service_role;
grant execute on function public.exportar_tabla_de_empresa(text, text, integer, integer) to service_role;;
