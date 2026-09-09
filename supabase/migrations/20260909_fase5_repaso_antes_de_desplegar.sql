-- Lo que salió al revisar las cinco fases antes de desplegarlas.
-- Aplicado en producción el 2026-09-09.
--
-- Dos cosas de la cola, las dos del mismo tipo: crece y nadie la mira.

-- 1. UN ÍNDICE PARA LA CLAVE.
--
-- El latido del servidor de voz llama cada treinta segundos, y en cada llamada
-- se comprueba si el mantenimiento de hoy ya está pedido buscando por
-- clave_unica. Son unas 2.900 consultas al día.
--
-- El único índice sobre esa columna es el único parcial, que sólo cubre las
-- filas pendientes o en curso. Esa comprobación mira TODOS los estados —lo que
-- busca es si ya se hizo—, así que no puede usarlo y recorre la tabla entera.
--
-- Con la tabla vacía da igual. Pero la tabla de trabajos sólo crece, y a los
-- seis meses son decenas de miles de filas recorridas 2.900 veces al día para
-- no encontrar nada casi siempre. Barato ahora, caro luego.
create index if not exists trabajos_por_clave
  on public.trabajos (clave_unica)
  where clave_unica is not null;

-- 2. Y ALGUIEN QUE LA LIMPIE.
--
-- Cada informe pedido, cada mantenimiento diario y cada copia de grabación
-- deja su fila, y nada la quitaba. Es el mismo problema que la fase 3 arregló
-- para lead_events y audit_logs, en una tabla creada en la fase 2 sin
-- acordarse de él.
--
-- Aquí se borra en vez de archivar: el histórico de "el informe diario de una
-- empresa salió bien hace ocho meses" no le sirve a nadie. Lo que importa
-- —qué se envió y a quién— vive en los datos, no en la cola.
--
-- El mínimo de dos días no es decorativo: el mantenimiento del día se pide con
-- una clave que lleva la fecha, y esa clave sólo evita repetirlo mientras la
-- fila exista. Purgar los trabajos del mismo día haría que el mantenimiento se
-- pidiera otra vez cada treinta segundos.
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
grant execute on function public.purgar_trabajos(integer, integer) to service_role;
