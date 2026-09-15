-- Preparación revisable. Aplicar mediante el gestor de migraciones de Supabase.
begin;

create table if not exists public.auth_challenges (
  id text primary key,
  email text not null,
  client_id text not null references public.clients(id) on delete cascade,
  payload jsonb not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists auth_challenges_expiry on public.auth_challenges(expires_at);
alter table public.auth_challenges enable row level security;
revoke all on public.auth_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.auth_challenges to service_role;

create or replace function public.tomar_intento_auth(p_id text)
returns jsonb language sql security invoker set search_path = '' as $$
  update public.auth_challenges set attempts = attempts + 1
  where id = p_id and attempts < 5 and consumed_at is null and expires_at > clock_timestamp()
  returning jsonb_build_object('id', id, 'attempts', attempts, 'code_hash', code_hash);
$$;
revoke all on function public.tomar_intento_auth(text) from public, anon, authenticated;
grant execute on function public.tomar_intento_auth(text) to service_role;

create table if not exists public.security_rate_limits (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
create index if not exists security_rate_limits_expiry on public.security_rate_limits(expires_at);
alter table public.security_rate_limits enable row level security;
revoke all on public.security_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.security_rate_limits to service_role;

create or replace function public.consumir_limite_seguridad(p_key text, p_limit integer, p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.security_rate_limits;
begin
  if p_limit < 1 or p_window_ms < 1 or p_window_ms > 86400000 or length(p_key) > 200 then
    raise exception 'Invalid limit';
  end if;
  insert into public.security_rate_limits as limits(key, count, expires_at)
  values(p_key, 1, clock_timestamp() + make_interval(secs => p_window_ms / 1000.0))
  on conflict(key) do update set
    count = case when limits.expires_at <= clock_timestamp() then 1 else least(limits.count + 1, p_limit + 1) end,
    expires_at = case when limits.expires_at <= clock_timestamp()
      then clock_timestamp() + make_interval(secs => p_window_ms / 1000.0) else limits.expires_at end
  returning * into r;
  return jsonb_build_object('allowed', r.count <= p_limit, 'remaining', greatest(0,p_limit-r.count),
    'resetAt', extract(epoch from r.expires_at)*1000, 'limit', p_limit, 'strategy', 'postgres');
end;
$$;
revoke all on function public.consumir_limite_seguridad(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consumir_limite_seguridad(text,integer,integer) to service_role;

-- El portal nunca escribe roles de plataforma. Las dos tablas se actualizan
-- en la misma transacción y un email existente nunca cambia de empresa.
create or replace function public.gestionar_usuario_portal(
  p_mode text, p_client text, p_actor text, p_id uuid default null,
  p_email text default '', p_name text default '', p_role text default 'agent',
  p_phone text default '', p_active boolean default true, p_password text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actor public.portal_users; target public.portal_users; auth_user public.users; result public.portal_users;
begin
  -- Serializa cambios de pertenencia dentro de una empresa.
  perform 1 from public.clients where id = p_client for update;
  select * into actor from public.portal_users where client_id = p_client and email = lower(trim(p_actor)) and is_active = true;
  if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_mode not in ('create','update','password') or p_role not in ('owner','admin','manager','agent','viewer') then
    raise exception 'Invalid role or operation' using errcode='22023';
  end if;
  if p_password is not null and p_password !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$' then
    raise exception 'Invalid password hash' using errcode='22023';
  end if;
  if p_mode = 'create' then
    if p_role = 'owner' and actor.role <> 'owner' then raise exception 'Forbidden' using errcode='42501'; end if;
    if length(p_email) > 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_name) not between 1 and 200 then
      raise exception 'Invalid input' using errcode='22023';
    end if;
    if exists(select 1 from public.users where lower(email)=lower(trim(p_email))) or
       exists(select 1 from public.portal_users where lower(email)=lower(trim(p_email))) then
      raise exception 'Email unavailable' using errcode='23505';
    end if;
    insert into public.users(email, password, role, client_id)
      values(lower(trim(p_email)), p_password, 'client', p_client);
    insert into public.portal_users(client_id,email,full_name,role,phone,is_active)
      values(p_client,lower(trim(p_email)),p_name,p_role,left(p_phone,30),true) returning * into result;
  else
    select * into target from public.portal_users where id=p_id and client_id=p_client for update;
    if target.id is null then raise exception 'Not found' using errcode='P0002'; end if;
    select * into auth_user from public.users where email=target.email and client_id=p_client for update;
    if auth_user.id is null or auth_user.role in ('admin','super_admin') then raise exception 'Forbidden' using errcode='42501'; end if;
    if target.role='owner' and actor.role<>'owner' then raise exception 'Forbidden' using errcode='42501'; end if;
    if p_mode='password' then
      if p_password is null then raise exception 'Password required'; end if;
      update public.users set password=p_password,password_hash=null,session_epoch=coalesce(session_epoch,0)+1 where id=auth_user.id;
      update public.portal_users set password_hash=null where id=target.id returning * into result;
    else
      if lower(trim(p_email))<>target.email then raise exception 'Email changes require verification' using errcode='22023'; end if;
      if p_role='owner' and actor.role<>'owner' then raise exception 'Forbidden' using errcode='42501'; end if;
      if target.id=actor.id and (not p_active or p_role<>actor.role) then raise exception 'Cannot remove own access' using errcode='42501'; end if;
      if target.role='owner' and (not p_active or p_role<>'owner') and
        not exists(select 1 from public.portal_users where client_id=p_client and role='owner' and is_active=true and id<>target.id) then
        raise exception 'Last owner' using errcode='42501';
      end if;
      update public.users set role='client',session_epoch=coalesce(session_epoch,0)+1 where id=auth_user.id;
      update public.portal_users set full_name=left(p_name,200),role=p_role,phone=left(p_phone,30),is_active=p_active
        where id=target.id returning * into result;
    end if;
  end if;
  insert into public.audit_logs(client_id,entity_type,entity_id,action,actor,changes)
    values(p_client,'portal_user',result.id::text,'portal_user_'||p_mode,p_actor,
      jsonb_build_object('role',result.role,'active',result.is_active)::text);
  return jsonb_build_object('id',result.id,'email',result.email,'full_name',result.full_name,
    'role',result.role,'phone',result.phone,'is_active',result.is_active);
end;
$$;
revoke all on function public.gestionar_usuario_portal(text,text,text,uuid,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.gestionar_usuario_portal(text,text,text,uuid,text,text,text,text,boolean,text) to service_role;

create or replace function public.purgar_seguridad_caducada()
returns void language sql security invoker set search_path = '' as $$
  delete from public.auth_challenges where expires_at < now() - interval '1 day';
  delete from public.security_rate_limits where expires_at < now() - interval '1 day';
$$;
revoke all on function public.purgar_seguridad_caducada() from public, anon, authenticated;
grant execute on function public.purgar_seguridad_caducada() to service_role;
commit;
