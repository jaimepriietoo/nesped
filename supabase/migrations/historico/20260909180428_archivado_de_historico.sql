-- Archivado de lead_events y audit_logs.
--
-- Son las dos tablas que crecen y no paran: una fila por cada cosa que le
-- pasa a un contacto y una por cada acción con consecuencias. Nadie las borra
-- porque nadie quiere ser quien borró el rastro, así que crecen para siempre.
--
-- El problema no es el espacio, que es barato. Es que toda consulta sobre esas
-- tablas —el recorrido de un contacto, el registro de una empresa— tiene que
-- pasar por índices que cada mes son más grandes, y esos índices compiten por
-- la memoria con las consultas que sí atienden a alguien.
--
-- No se borra: se mueve. Lo antiguo va a una tabla gemela sin índices, que
-- ocupa poco y sigue ahí si alguien pregunta. Consultarla es lento, y está
-- bien que lo sea: no se consulta a diario.
--
-- Lo que NO hace esto: decidir cuánto tiempo se guarda un registro de
-- auditoría. Eso es una decisión legal, no técnica, y está en una variable de
-- entorno para que se pueda cambiar sin tocar código.

create table if not exists public.lead_events_archivo
  (like public.lead_events including defaults);

create table if not exists public.audit_logs_archivo
  (like public.audit_logs including defaults);

-- Un solo índice por tabla, y por empresa: lo único que se pregunta de un
-- archivo es "enséñame lo de esta empresa". Copiar todos los índices de la
-- tabla viva anularía la mitad del motivo de archivar.
create index if not exists lead_events_archivo_por_empresa
  on public.lead_events_archivo (client_id, created_at desc);

create index if not exists audit_logs_archivo_por_empresa
  on public.audit_logs_archivo (client_id, created_at desc);

/**
 * Mueve un lote de filas viejas al archivo.
 *
 * Va por lotes a propósito. Un `delete` de diez millones de filas coge un
 * bloqueo largo, hace crecer el WAL y puede tumbar la base de datos entera
 * durante el rato que dura. Mil filas cada vez tardan más en total y no
 * molestan a nadie mientras tanto.
 *
 * El movimiento es una sola sentencia: lo que sale de la tabla viva entra en
 * el archivo dentro de la misma transacción. No hay un instante en el que una
 * fila no esté en ninguna de las dos.
 *
 * @returns cuántas filas se movieron. Si devuelve el lote entero, es que
 *   quedan más y hay que volver a llamar.
 */
create or replace function public.archivar_lead_events(
  p_dias  integer default 180,
  p_lote  integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movidas integer;
begin
  with viejas as (
    select id from public.lead_events
    where created_at < now() - make_interval(days => greatest(coalesce(p_dias, 180), 1))
    order by created_at
    limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
  ),
  sacadas as (
    delete from public.lead_events e
    using viejas v where e.id = v.id
    returning e.*
  )
  insert into public.lead_events_archivo select * from sacadas;

  get diagnostics v_movidas = row_count;
  return v_movidas;
end;
$$;

create or replace function public.archivar_audit_logs(
  p_dias  integer default 365,
  p_lote  integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movidas integer;
begin
  with viejas as (
    select id from public.audit_logs
    where created_at < now() - make_interval(days => greatest(coalesce(p_dias, 365), 1))
    order by created_at
    limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
  ),
  sacadas as (
    delete from public.audit_logs a
    using viejas v where a.id = v.id
    returning a.*
  )
  insert into public.audit_logs_archivo select * from sacadas;

  get diagnostics v_movidas = row_count;
  return v_movidas;
end;
$$;

/**
 * Borra del archivo lo que ya no hay obligación de guardar.
 *
 * Esto sí borra, y por eso el plazo es largo y separado del de archivar. Un
 * registro de auditoría de hace tres años no sirve para operar y sí puede
 * ser una obligación; el número lo decide quien lleva el cumplimiento, no
 * esta función.
 */
create or replace function public.purgar_archivo(
  p_tabla text,
  p_dias  integer,
  p_lote  integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  if p_tabla not in ('lead_events_archivo', 'audit_logs_archivo') then
    raise exception 'Tabla no archivable: %', p_tabla;
  end if;

  execute format($f$
    with viejas as (
      select id from public.%I
      where created_at < now() - make_interval(days => %s)
      order by created_at
      limit %s
    )
    delete from public.%I t using viejas v where t.id = v.id
  $f$, p_tabla, greatest(coalesce(p_dias, 1095), 1), least(greatest(coalesce(p_lote, 1000), 1), 10000), p_tabla);

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

alter table public.lead_events_archivo enable row level security;
alter table public.audit_logs_archivo  enable row level security;

revoke all on table public.lead_events_archivo from public, anon, authenticated;
revoke all on table public.audit_logs_archivo  from public, anon, authenticated;

revoke all on function public.archivar_lead_events(integer, integer)   from public, anon, authenticated;
revoke all on function public.archivar_audit_logs(integer, integer)    from public, anon, authenticated;
revoke all on function public.purgar_archivo(text, integer, integer)   from public, anon, authenticated;
grant execute on function public.archivar_lead_events(integer, integer) to service_role;
grant execute on function public.archivar_audit_logs(integer, integer)  to service_role;
grant execute on function public.purgar_archivo(text, integer, integer) to service_role;;
