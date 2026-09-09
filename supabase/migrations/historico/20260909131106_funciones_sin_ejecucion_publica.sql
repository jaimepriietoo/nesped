-- Las funciones se podían llamar desde fuera, y revocárselo a anon no servía.
--
-- El permiso no estaba concedido a anon: estaba concedido a PUBLIC, que
-- incluye a todo el mundo. Es el comportamiento por defecto de Postgres al
-- crear una función, y es la trampa clásica: se revoca a los roles que uno
-- tiene en la cabeza, se comprueba `has_function_privilege('anon', ...)`,
-- sigue diciendo true, y no se entiende por qué.
--
-- Comprobado antes de este cambio: llamando a calculate_lead_score con la
-- clave pública devolvía un número. No filtraba datos —sólo puntúa lo que le
-- pasas— pero create_lead_event inserta, y la única razón de que no escribiera
-- era RLS. Dos capas menos de las que parecía.
--
-- postgres y service_role tienen su propio permiso explícito (proacl muestra
-- `postgres=X` y `service_role=X` aparte del `=X` de PUBLIC), así que
-- quitárselo a PUBLIC no les afecta.

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;

-- Y las funciones que se creen a partir de ahora nacen sin ese permiso.
alter default privileges in schema public revoke execute on functions from public;

-- Que quede dicho en la propia función por qué no la puede llamar cualquiera.
comment on function public.calculate_lead_score(text, text, text, text) is
  'Solo para el servidor (service_role). No es pública: se revocó EXECUTE a PUBLIC.';
comment on function public.create_lead_event(uuid, text, text, text, text, jsonb) is
  'Solo para el servidor (service_role). Escribe en lead_events; no es pública.';;
