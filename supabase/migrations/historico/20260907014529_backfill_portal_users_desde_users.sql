-- La tabla portal_users (directorio de equipo que enseña el portal) estaba
-- vacía mientras public.users tenía 6 cuentas capaces de iniciar sesión. El
-- resultado era que la pantalla de Equipo no mostraba a nadie y no había
-- forma de ver desde el portal quién tiene acceso, ni de retirárselo.
--
-- /api/portal/users/create ya escribe en las dos tablas, así que a partir de
-- ahora se mantienen alineadas. Esto sólo recupera lo anterior. Es un insert
-- puro: no toca ni borra ninguna fila existente.

insert into public.portal_users (client_id, full_name, email, role, is_active, created_at)
select
  u.client_id,
  -- No hay nombre en la tabla de login: se deriva del email como marcador.
  split_part(u.email, '@', 1) as full_name,
  u.email,
  u.role,
  true,
  coalesce(u.created_at, now())
from public.users u
where not exists (
  select 1 from public.portal_users p
  where p.client_id = u.client_id
    and lower(p.email) = lower(u.email)
);;
