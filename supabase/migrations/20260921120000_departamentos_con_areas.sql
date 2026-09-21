-- Tres departamentos con áreas dentro.
--
-- Fibergreen pidió tres puertas —Ventas, Soporte técnico, Administración— y
-- que Instalaciones, Facturación y Dirección fueran áreas dentro de las dos
-- últimas, no departamentos aparte. La columna guarda esas áreas para el
-- prompt y para la pantalla; el destino de un contacto sigue siendo la clave
-- del departamento. Aditiva.

alter table public.departamentos
  add column if not exists areas jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
