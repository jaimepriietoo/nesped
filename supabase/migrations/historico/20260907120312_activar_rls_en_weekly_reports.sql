-- weekly_reports era la única tabla de public con RLS desactivado. La clave
-- anónima de Supabase viaja en el navegador de cualquier visitante, así que
-- una tabla sin RLS es una tabla pública: hoy está vacía, pero en cuanto
-- guarde informes semanales por cliente los estaría enseñando a cualquiera,
-- y además admitiría escrituras.
--
-- Se activa sin políticas, igual que las otras dieciséis: la aplicación
-- entra siempre con la clave de servicio, que salta RLS, así que nada de lo
-- que ya funciona cambia. Lo que cambia es que la clave pública deja de ver
-- y de tocar esta tabla.

alter table public.weekly_reports enable row level security;;
