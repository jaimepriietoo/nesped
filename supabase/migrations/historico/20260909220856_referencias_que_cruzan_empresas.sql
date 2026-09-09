-- ¿Hay filas de una empresa que apunten a filas de otra?
--
-- Es la pregunta que decide si una empresa se puede mover sola, y por tanto si
-- repartir por fragmentos es posible algún día. Si una alerta de la empresa A
-- apunta a una llamada de la empresa B, al llevarte A la referencia se queda
-- huérfana y te has llevado media cosa.
--
-- Pero además es una comprobación de aislamiento a secas, y esa vale hoy: un
-- enlace que cruza empresas casi siempre quiere decir que alguien escribió una
-- fila sin filtrar, y eso es una fuga de datos, no un problema de escalar.
--
-- Se deriva de las claves ajenas del catálogo y no de una lista escrita a
-- mano. Una lista se queda vieja en cuanto alguien añade una relación, y no
-- avisa: deja de comprobar en silencio.
--
-- Comprobado el 2026-09-09: cero cruces. Con la advertencia honesta de que
-- había 7 enlaces reales en total, así que la comprobación tiene poco donde
-- morder todavía. Vale por lo que comprobará cuando haya datos.
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
      con.conname                                  as nombre,
      hijo.relname::text                           as tabla_hija,
      att_h.attname::text                          as columna_hija,
      padre.relname::text                          as tabla_padre,
      att_p.attname::text                          as columna_padre
    from pg_constraint con
    join pg_class hijo  on hijo.oid  = con.conrelid
    join pg_class padre on padre.oid = con.confrelid
    join pg_attribute att_h on att_h.attrelid = con.conrelid  and att_h.attnum = con.conkey[1]
    join pg_attribute att_p on att_p.attrelid = con.confrelid and att_p.attnum = con.confkey[1]
    where con.contype = 'f'
      and con.connamespace = 'public'::regnamespace
      -- Sólo las que unen dos tablas que TIENEN empresa. Una clave ajena a
      -- clients no cruza nada: es la que define a qué empresa pertenece.
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

revoke all on function public.referencias_que_cruzan_empresas() from public, anon, authenticated;
grant execute on function public.referencias_que_cruzan_empresas() to service_role;;
