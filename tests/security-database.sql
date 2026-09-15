-- Pruebas aisladas: toda fila de prueba se revierte al terminar.
begin;
set local role service_role;
do $$
declare
  company text := 'security-test-' || gen_random_uuid()::text;
  other_company text := 'security-test-' || gen_random_uuid()::text;
  owner_mail text := gen_random_uuid()::text || '@test.invalid';
  victim_mail text := gen_random_uuid()::text || '@test.invalid';
  agent_mail text := gen_random_uuid()::text || '@test.invalid';
  challenge text := gen_random_uuid()::text;
  rate_key text := gen_random_uuid()::text;
  target_id uuid;
  result jsonb;
  total integer;
begin
  insert into public.clients(id,name) values(company,'Security test'),(other_company,'Security test');
  insert into public.users(email,password,role,client_id) values(owner_mail,'!fixture','client',company),(victim_mail,'!fixture','client',other_company);
  insert into public.portal_users(email,full_name,role,client_id,is_active) values(owner_mail,'Owner','owner',company,true),(victim_mail,'Victim','owner',other_company,true);

  result := public.gestionar_usuario_portal('create',company,owner_mail,null,agent_mail,'Agent','admin');
  target_id := (result->>'id')::uuid;
  if (select role from public.users where email=agent_mail) <> 'client' then raise exception 'Platform role leaked'; end if;
  if result ? 'password' or result ? 'password_hash' then raise exception 'Password hash exposed'; end if;

  begin
    perform public.gestionar_usuario_portal('create',company,owner_mail,null,victim_mail,'Victim','agent');
    raise exception 'Cross-tenant takeover accepted';
  exception when unique_violation then null; end;
  if (select client_id from public.users where email=victim_mail)<>other_company then raise exception 'Victim moved'; end if;
  begin
    perform public.gestionar_usuario_portal('create',company,owner_mail,null,gen_random_uuid()::text||'@test.invalid','Agent','super_admin');
    raise exception 'Invalid role accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.gestionar_usuario_portal('update',company,owner_mail,target_id,victim_mail,'Agent','agent');
    raise exception 'Email overwrite accepted';
  exception when invalid_parameter_value then null; end;

  result := public.gestionar_usuario_portal('update',company,owner_mail,target_id,agent_mail,'Agent','agent','',false);
  if (result->>'is_active')::boolean then raise exception 'Disable failed'; end if;
  if (select session_epoch from public.users where email=agent_mail)<>1 then raise exception 'Sessions not revoked'; end if;
  begin
    perform public.gestionar_usuario_portal('create',company,agent_mail,null,gen_random_uuid()::text||'@test.invalid','Agent','agent');
    raise exception 'Disabled actor accepted';
  exception when insufficient_privilege then null; end;

  update public.users set role='super_admin' where email=agent_mail;
  begin
    perform public.gestionar_usuario_portal('password',company,owner_mail,target_id,p_password=>'scrypt$'||repeat('a',32)||'$'||repeat('b',128));
    raise exception 'Platform admin password overwritten';
  exception when insufficient_privilege then null; end;

  insert into public.auth_challenges(id,email,client_id,payload,code_hash,expires_at)
    values(challenge,owner_mail,company,'{}','hash',now()+interval '10 minutes');
  for attempt in 1..5 loop
    result := public.tomar_intento_auth(challenge);
    if result is null or (result->>'attempts')::int<>attempt then raise exception 'Counter failure'; end if;
  end loop;
  if public.tomar_intento_auth(challenge) is not null then raise exception 'Sixth attempt accepted'; end if;
  update public.auth_challenges set attempts=0,consumed_at=now() where id=challenge;
  if public.tomar_intento_auth(challenge) is not null then raise exception 'Used challenge accepted'; end if;
  update public.auth_challenges set consumed_at=null,expires_at=now()-interval '1 second' where id=challenge;
  if public.tomar_intento_auth(challenge) is not null then raise exception 'Expired challenge accepted'; end if;

  result := public.consumir_limite_seguridad(rate_key,2,60000);
  if not (result->>'allowed')::boolean then raise exception 'First blocked'; end if;
  perform public.consumir_limite_seguridad(rate_key,2,60000);
  result := public.consumir_limite_seguridad(rate_key,2,60000);
  if (result->>'allowed')::boolean then raise exception 'Limit bypassed'; end if;
  update public.security_rate_limits set expires_at=now()-interval '1 second' where key=rate_key;
  result := public.consumir_limite_seguridad(rate_key,2,60000);
  if not (result->>'allowed')::boolean then raise exception 'Expired limit not reset'; end if;
  select count(*) into total from public.users where client_id=company;
  if total<>2 then raise exception 'Failed operation left orphan users'; end if;
  if public.revocar_sesiones_usuario(owner_mail)<>1 or public.revocar_sesiones_usuario(owner_mail)<>2 then
    raise exception 'Revocation not incremented atomically';
  end if;
  begin
    perform public.crear_usuario_administrado(owner_mail,company,gen_random_uuid()::text||'@test.invalid','scrypt$'||repeat('a',32)||'$'||repeat('b',128));
    raise exception 'Tenant owner used platform administration';
  exception when insufficient_privilege then null; end;
  update public.users set role='admin' where email=owner_mail;
  begin
    perform public.crear_usuario_administrado(owner_mail,company,gen_random_uuid()::text||'@test.invalid','scrypt$'||repeat('a',32)||'$'||repeat('b',128),'super_admin');
    raise exception 'Platform admin escalated to super_admin';
  exception when insufficient_privilege then null; end;
  result := public.crear_usuario_administrado(owner_mail,company,gen_random_uuid()::text||'@test.invalid','scrypt$'||repeat('a',32)||'$'||repeat('b',128),'client','owner');
  if not exists(select 1 from public.portal_users where email=result->>'email' and client_id=company and role='owner' and is_active=true) then
    raise exception 'New login missing its active portal profile';
  end if;
  if result ? 'password' or result ? 'password_hash' then raise exception 'Admin create leaked password hash'; end if;
  if has_function_privilege('anon','public.crear_usuario_administrado(text,text,text,text,text,text)','EXECUTE') or
     has_function_privilege('authenticated','public.revocar_sesiones_usuario(text)','EXECUTE') or
     has_table_privilege('anon','public.auth_challenges','SELECT') then
    raise exception 'Public access to privileged auth objects';
  end if;
end;
$$;
rollback;
select 'PASS: roles, aislamiento, revocación, 2FA, límites y atomicidad; fixtures revertidas' as security_tests;
