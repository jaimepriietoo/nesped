-- Auditoría encadenada: cada fila lleva el hash de la anterior.
--
-- POR QUÉ. audit_logs se escribe con service_role, que puede reescribirla.
-- Un registro que su propio dueño puede editar no demuestra nada ante un
-- cliente ni ante un auditor. Con la cadena, cambiar o borrar una fila rompe
-- los hashes de todas las siguientes, y `verificar_cadena_auditoria()` lo
-- detecta. Los triggers impiden UPDATE siempre y DELETE salvo al archivar.
--
-- LO QUE NO CUBRE. Quien pueda hacer DROP TRIGGER (el rol postgres desde el
-- panel) puede quitar el candado. Por eso el siguiente paso es volcar la
-- cadena fuera, a un almacén que no admita reescrituras.
--
-- ADITIVA. Añade tres columnas al final de audit_logs y de su archivo, en el
-- mismo orden, para que `insert into audit_logs_archivo select *` siga
-- funcionando. Rellena las filas existentes por created_at.

create sequence if not exists public.audit_logs_secuencia as bigint;

-- Cuando la purga borra el principio de la cadena, aquí queda el último
-- eslabón borrado. Así la primera fila que sobrevive sigue teniendo con qué
-- enlazar y borrar "por el principio" tampoco pasa desapercibido.
create table if not exists public.auditoria_ancla (
  id boolean primary key default true check (id),
  secuencia bigint not null,
  hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.auditoria_ancla enable row level security;
alter table public.auditoria_ancla force row level security;
revoke all on public.auditoria_ancla from public, anon, authenticated;
grant select, insert, update on public.auditoria_ancla to service_role;

alter table public.audit_logs
  add column if not exists secuencia bigint,
  add column if not exists hash_anterior text,
  add column if not exists hash text;

alter table public.audit_logs_archivo
  add column if not exists secuencia bigint,
  add column if not exists hash_anterior text,
  add column if not exists hash text;

create unique index if not exists audit_logs_secuencia_unica
  on public.audit_logs (secuencia);
create unique index if not exists audit_logs_archivo_secuencia_unica
  on public.audit_logs_archivo (secuencia);

-- Lo que se firma. Se deja en una función aparte para que la verificación
-- desde fuera pueda pedir exactamente el mismo material.
create or replace function public.material_auditoria(
  p_secuencia bigint, p_hash_anterior text, p_client_id text, p_entity_type text,
  p_entity_id text, p_action text, p_actor text, p_changes jsonb, p_created_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws('|',
    p_secuencia::text,
    coalesce(p_hash_anterior, ''),
    p_client_id, p_entity_type, p_entity_id, p_action,
    coalesce(p_actor, ''),
    coalesce(p_changes::text, '{}'),
    to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
$$;

create or replace function public.hash_auditoria(p_material text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_material, 'UTF8')), 'hex');
$$;

-- SECURITY DEFINER: la cadena es global, cruza empresas, y el portal escribe
-- como nesped_app, que sólo ve la suya. El dueño (postgres) tiene BYPASSRLS.
create or replace function public.encadenar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior text;
begin
  -- Un insert cada vez: dos a la vez con el mismo "anterior" romperían la cadena.
  perform pg_advisory_xact_lock(hashtext('public.audit_logs.cadena'));

  select hash into v_anterior from (
    select hash, secuencia from public.audit_logs
    union all
    select hash, secuencia from public.audit_logs_archivo
  ) u order by secuencia desc limit 1;

  new.secuencia := nextval('public.audit_logs_secuencia');
  new.hash_anterior := v_anterior;
  new.created_at := coalesce(new.created_at, now());
  new.hash := public.hash_auditoria(public.material_auditoria(
    new.secuencia, new.hash_anterior, new.client_id, new.entity_type,
    new.entity_id, new.action, new.actor, new.changes, new.created_at
  ));
  return new;
end;
$$;

create or replace function public.proteger_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.archivando_auditoria', true) = '1' then
    return old;
  end if;
  raise exception 'La auditoría no se modifica ni se borra (%)', tg_op
    using errcode = '42501';
end;
$$;

-- Los triggers los ejecuta Postgres, no un rol: nadie los llama a mano.
revoke all on function public.encadenar_auditoria() from public, anon, authenticated;
grant execute on function public.encadenar_auditoria() to service_role;
revoke all on function public.proteger_auditoria() from public, anon, authenticated;
grant execute on function public.proteger_auditoria() to service_role;

-- Relleno de lo que ya había, en orden de creación, antes de activar el trigger.
do $$
declare
  v_fila record;
  v_anterior text := null;
  v_seq bigint;
begin
  for v_fila in
    select * from public.audit_logs where secuencia is null order by created_at, id
  loop
    v_seq := nextval('public.audit_logs_secuencia');
    update public.audit_logs set
      secuencia = v_seq,
      hash_anterior = v_anterior,
      hash = public.hash_auditoria(public.material_auditoria(
        v_seq, v_anterior, client_id, entity_type, entity_id, action, actor, changes, created_at
      ))
    where id = v_fila.id;
    select hash into v_anterior from public.audit_logs where id = v_fila.id;
  end loop;
end
$$;

alter table public.audit_logs
  alter column secuencia set not null,
  alter column hash set not null;

drop trigger if exists audit_logs_encadenar on public.audit_logs;
create trigger audit_logs_encadenar
  before insert on public.audit_logs
  for each row execute function public.encadenar_auditoria();

drop trigger if exists audit_logs_proteger on public.audit_logs;
create trigger audit_logs_proteger
  before update or delete on public.audit_logs
  for each row execute function public.proteger_auditoria();

drop trigger if exists audit_logs_archivo_proteger on public.audit_logs_archivo;
create trigger audit_logs_archivo_proteger
  before update or delete on public.audit_logs_archivo
  for each row execute function public.proteger_auditoria();

-- Archivar sigue funcionando: la función abre la ventana sólo dentro de su
-- propia transacción. La purga del archivo también, con el mismo permiso.
create or replace function public.archivar_audit_logs(
  p_dias integer default 365,
  p_lote integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movidas integer;
begin
  perform set_config('app.archivando_auditoria', '1', true);
  with viejas as (
    select id from public.audit_logs
    where created_at < now() - make_interval(days => greatest(coalesce(p_dias, 365), 1))
    order by created_at
    limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
  ),
  sacadas as (
    delete from public.audit_logs a using viejas v where a.id = v.id returning a.*
  )
  insert into public.audit_logs_archivo select * from sacadas;

  get diagnostics v_movidas = row_count;
  return v_movidas;
end;
$$;

-- Recorre la cadena entera (activa + archivo) y devuelve la primera rotura,
-- o ninguna fila si todo cuadra. Sólo lectura; la puede llamar el cron.
create or replace function public.verificar_cadena_auditoria(p_desde bigint default 0)
returns table (secuencia bigint, motivo text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_fila record;
  v_anterior text := null;
  v_esperada bigint := null;
begin
  -- Si la purga ya borró el principio, la primera fila enlaza con el ancla.
  if p_desde = 0 then
    select hash, auditoria_ancla.secuencia + 1 into v_anterior, v_esperada from public.auditoria_ancla;
  end if;

  for v_fila in
    -- Alias por columna: en plpgsql el nombre `secuencia` es también el OUT.
    select * from (
      select a.secuencia, a.hash_anterior, a.hash, a.client_id, a.entity_type, a.entity_id, a.action, a.actor, a.changes, a.created_at
      from public.audit_logs a
      union all
      select b.secuencia, b.hash_anterior, b.hash, b.client_id, b.entity_type, b.entity_id, b.action, b.actor, b.changes, b.created_at
      from public.audit_logs_archivo b
    ) u where u.secuencia > p_desde order by u.secuencia
  loop
    if v_esperada is not null and v_fila.secuencia <> v_esperada then
      secuencia := v_fila.secuencia; motivo := 'falta la secuencia ' || v_esperada; return next; return;
    end if;
    if p_desde = 0 or v_esperada is not null then
      -- Con p_desde > 0 y sin ancla no se conoce el eslabón anterior a la
      -- primera fila; a partir de la segunda, sí.
      if v_fila.hash_anterior is distinct from v_anterior then
        secuencia := v_fila.secuencia; motivo := 'hash_anterior no enlaza'; return next; return;
      end if;
    end if;
    if v_fila.hash <> public.hash_auditoria(public.material_auditoria(
      v_fila.secuencia, v_fila.hash_anterior, v_fila.client_id, v_fila.entity_type,
      v_fila.entity_id, v_fila.action, v_fila.actor, v_fila.changes, v_fila.created_at
    )) then
      secuencia := v_fila.secuencia; motivo := 'el contenido no coincide con su hash'; return next; return;
    end if;
    v_anterior := v_fila.hash;
    v_esperada := v_fila.secuencia + 1;
  end loop;
  return;
end;
$$;

revoke all on function public.verificar_cadena_auditoria(bigint) from public, anon, authenticated;
grant execute on function public.verificar_cadena_auditoria(bigint) to service_role;

revoke all on function public.archivar_audit_logs(integer, integer) from public, anon, authenticated;
grant execute on function public.archivar_audit_logs(integer, integer) to service_role;

-- La purga del archivo también borra: abre la misma ventana.
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
  v_ultima bigint;
  v_hash text;
begin
  if p_tabla not in ('lead_events_archivo', 'audit_logs_archivo') then
    raise exception 'Tabla no archivable: %', p_tabla;
  end if;

  perform set_config('app.archivando_auditoria', '1', true);

  if p_tabla = 'audit_logs_archivo' then
    -- La auditoría se purga por secuencia, no por fecha: la cadena sólo
    -- puede perder eslabones por el principio, y el último borrado se ancla.
    select max(lote.secuencia) into v_ultima from (
      select secuencia from public.audit_logs_archivo
      where created_at < now() - make_interval(days => greatest(coalesce(p_dias, 1095), 1))
      order by secuencia
      limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
    ) lote;
    if v_ultima is null then return 0; end if;

    select hash into v_hash from public.audit_logs_archivo where secuencia = v_ultima;
    delete from public.audit_logs_archivo where secuencia <= v_ultima;
    get diagnostics v_borradas = row_count;

    insert into public.auditoria_ancla (id, secuencia, hash, updated_at)
      values (true, v_ultima, v_hash, now())
    on conflict (id) do update
      set secuencia = excluded.secuencia, hash = excluded.hash, updated_at = now();
    return v_borradas;
  end if;

  execute format($f$
    with viejas as (
      select id from public.%I
      where created_at < now() - make_interval(days => %s)
      order by created_at
      limit %s
    )
    delete from public.%I t using viejas v where t.id = v.id
  $f$, p_tabla, greatest(coalesce(p_dias, 1095), 1),
       least(greatest(coalesce(p_lote, 1000), 1), 10000), p_tabla);

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.purgar_archivo(text, integer, integer) from public, anon, authenticated;
grant execute on function public.purgar_archivo(text, integer, integer) to service_role;

-- Verificar la cadena es lo único que el portal no necesita; el cron lo hace
-- con service_role. Las dos funciones de material y hash son puras y públicas
-- para que la comprobación desde fuera pueda reproducirlas.
revoke all on function public.material_auditoria(bigint, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.material_auditoria(bigint, text, text, text, text, text, text, jsonb, timestamptz) to service_role, nesped_app;
revoke all on function public.hash_auditoria(text) from public, anon, authenticated;
grant execute on function public.hash_auditoria(text) to service_role, nesped_app;

-- Las últimas filas con el material ya formateado por Postgres (jsonb y
-- fecha), para que Node pueda recalcular los hashes sin reproducir el
-- formato de jsonb. Es sólo lectura y cruza empresas: service_role.
create or replace function public.ultimas_filas_auditoria(p_limite integer default 200)
returns table (
  secuencia bigint, hash_anterior text, hash text, client_id text, entity_type text,
  entity_id text, action text, actor text, changes_texto text, created_at_utc text
)
language sql
security definer
set search_path = ''
stable
as $$
  select u.secuencia, u.hash_anterior, u.hash, u.client_id, u.entity_type, u.entity_id,
         u.action, u.actor, u.changes::text,
         to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  from (
    select a.secuencia, a.hash_anterior, a.hash, a.client_id, a.entity_type, a.entity_id, a.action, a.actor, a.changes, a.created_at
    from public.audit_logs a
    union all
    select b.secuencia, b.hash_anterior, b.hash, b.client_id, b.entity_type, b.entity_id, b.action, b.actor, b.changes, b.created_at
    from public.audit_logs_archivo b
  ) u
  order by u.secuencia desc
  limit least(greatest(coalesce(p_limite, 200), 1), 5000);
$$;

revoke all on function public.ultimas_filas_auditoria(integer) from public, anon, authenticated;
grant execute on function public.ultimas_filas_auditoria(integer) to service_role;
