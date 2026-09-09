-- La tabla de trabajos sólo crece.
--
-- Cada informe pedido, cada mantenimiento diario, cada copia de grabación deja
-- su fila, y nada la quita. Con el latido cada treinta segundos y un
-- mantenimiento al día, son cientos de filas al mes sin contar los informes.
--
-- Es el mismo problema que la fase 3 arregló para lead_events y audit_logs,
-- en una tabla que se creó en la fase 2 sin acordarse de él.
--
-- Aquí sí se borra en vez de archivar: el histórico de "el informe diario de
-- una empresa salió bien hace ocho meses" no le sirve a nadie. Lo que importa
-- —qué se envió y a quién— vive en los datos, no en la cola.
--
-- Un mes es de sobra para investigar cualquier cosa rara, y deja muy por
-- encima del día que necesita la clave del mantenimiento para no repetirse.
create or replace function public.purgar_trabajos(
  p_dias integer default 30,
  p_lote integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrados integer;
begin
  with viejos as (
    select id from public.trabajos
    where estado in ('hecho', 'fallido')
      and terminado_en < now() - make_interval(days => greatest(coalesce(p_dias, 30), 2))
    order by terminado_en
    limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
  )
  delete from public.trabajos t using viejos v where t.id = v.id;

  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

revoke all on function public.purgar_trabajos(integer, integer) from public, anon, authenticated;
grant execute on function public.purgar_trabajos(integer, integer) to service_role;;
