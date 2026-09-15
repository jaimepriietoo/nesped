create or replace function public.crear_usuario_administrado(
 p_actor text, p_client text, p_email text, p_password text, p_role text default 'client', p_portal_role text default 'agent'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.users; result public.users;
begin
 select u.* into actor from public.users u join public.portal_users p on p.email=u.email and p.client_id=u.client_id
 join public.clients c on c.id=u.client_id
 where u.email=lower(trim(p_actor)) and p.is_active=true and c.is_active is not false and u.role in ('admin','super_admin');
 if actor.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_role not in ('client','admin','super_admin') or p_portal_role not in ('owner','admin','manager','agent','viewer') then raise exception 'Invalid role' using errcode='22023'; end if;
 if p_role in ('admin','super_admin') and actor.role<>'super_admin' then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_password is null or p_password !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$' or
 p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid input' using errcode='22023'; end if;
 perform 1 from public.clients where id=p_client and is_active is not false for update;
 if not found then raise exception 'Client unavailable' using errcode='P0002'; end if;
 if exists(select 1 from public.users where lower(email)=lower(trim(p_email))) or exists(select 1 from public.portal_users where lower(email)=lower(trim(p_email))) then raise exception 'Email unavailable' using errcode='23505'; end if;
 insert into public.users(email,password,role,client_id) values(lower(trim(p_email)),p_password,p_role,p_client) returning * into result;
 insert into public.portal_users(email,full_name,role,client_id,is_active) values(result.email,split_part(result.email,'@',1),p_portal_role,p_client,true);
 insert into public.audit_logs(client_id,entity_type,entity_id,action,actor,changes)
 values(p_client,'user',result.id::text,'admin_user_created',p_actor,jsonb_build_object('role',p_role,'portal_role',p_portal_role));
 return jsonb_build_object('id',result.id,'email',result.email,'role',result.role,'client_id',result.client_id,'created_at',result.created_at);
end;
$$;
revoke all on function public.crear_usuario_administrado(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.crear_usuario_administrado(text,text,text,text,text,text) to service_role;
create or replace function public.revocar_sesiones_usuario(p_email text)
returns bigint language sql security invoker set search_path='' as $$
 update public.users set session_epoch=coalesce(session_epoch,0)+1 where email=lower(trim(p_email)) returning session_epoch;
$$;
revoke all on function public.revocar_sesiones_usuario(text) from public,anon,authenticated;
grant execute on function public.revocar_sesiones_usuario(text) to service_role;
create unique index if not exists clients_custom_domain_unique on public.clients(lower(custom_domain)) where nullif(trim(custom_domain),'') is not null;
