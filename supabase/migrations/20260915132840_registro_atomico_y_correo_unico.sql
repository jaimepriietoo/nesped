-- Registro atómico y correo único.
--
-- Escrita por Codex y aplicada directamente; este archivo la trae al
-- repositorio con su explicación (el volcado exacto está en historico/).
--
-- Darse de alta creaba cuatro filas en cuatro peticiones: clients,
-- client_settings, users y portal_users. Si la tercera fallaba, quedaba una
-- empresa sin usuario y un correo a medias. Ahora es una función: o entra
-- todo o no entra nada. Y el correo es único sin distinguir mayúsculas en
-- users y portal_users, que era la otra forma de acabar con dos cuentas.
--
-- La función valida forma (slug, correo, plan y que la contraseña llegue ya
-- con hash scrypt) y es SECURITY INVOKER: sólo la llama service_role.
create unique index if not exists users_email_lower_unique on public.users(lower(email));
create unique index if not exists portal_users_email_lower_unique on public.portal_users(lower(email));
create or replace function public.registrar_empresa_segura(p_client text,p_company text,p_email text,p_password text,p_plan text)
returns text language plpgsql security invoker set search_path='' as $$
begin
 if p_client is null or p_client !~ '^[a-z0-9-]{1,80}$' or p_company is null or length(trim(p_company)) not between 1 and 200 or
 p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
 p_plan is null or p_plan not in ('growth','intelligence') or p_password is null or p_password !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$' then
  raise exception 'Invalid signup' using errcode='22023';
 end if;
 insert into public.clients(id,name,brand_name,owner_email,plan,billing_status,is_active)
 values(p_client,trim(p_company),trim(p_company),lower(trim(p_email)),p_plan,'pendiente',true);
 insert into public.client_settings(client_id,weekly_report_email,daily_report_email)
 values(p_client,lower(trim(p_email)),lower(trim(p_email)));
 insert into public.users(email,password,role,client_id) values(lower(trim(p_email)),p_password,'client',p_client);
 insert into public.portal_users(client_id,email,full_name,role,is_active)
 values(p_client,lower(trim(p_email)),trim(p_company),'owner',true);
 return p_client;
end;
$$;
revoke all on function public.registrar_empresa_segura(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.registrar_empresa_segura(text,text,text,text,text) to service_role;
;
