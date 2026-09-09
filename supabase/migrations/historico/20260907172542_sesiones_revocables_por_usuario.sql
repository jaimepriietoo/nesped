-- Permite invalidar de golpe todas las sesiones de una cuenta.
--
-- Hasta ahora una sesión robada valía siete días y no había forma de
-- matarla: cerrar sesión sólo borra la cookie del navegador donde se pulsa,
-- y cambiar la contraseña tampoco echaba a nadie. Es decir, quien te robaba
-- la sesión seguía dentro aunque cambiases la clave, que es justo lo primero
-- que hace cualquiera al sospechar.
--
-- El token de sesión lleva ahora este número dentro. Si no coincide con el
-- de la fila del usuario, la sesión deja de valer. Subirlo en uno echa a
-- todos los navegadores a la vez, y se sube solo al cambiar la contraseña.
--
-- No cuesta ninguna consulta extra: la autenticación ya lee la fila del
-- usuario en cada petición para comprobar su rol.

alter table public.users
  add column if not exists session_epoch integer not null default 0;

comment on column public.users.session_epoch is
  'Se incrementa para invalidar todas las sesiones abiertas de esta cuenta.';;
