-- Índices compuestos para la forma real de las consultas del portal.
--
-- Todas tienen la misma forma:
--
--   WHERE client_id = ? ORDER BY created_at DESC LIMIT n
--
-- y hasta ahora todos los índices eran de una sola columna. Con eso Postgres
-- tiene que elegir entre recorrer el índice de client_id y ordenar en memoria,
-- o recorrer el de created_at y descartar casi todo. Con las filas de hoy da
-- exactamente igual; con decenas de millones decide si el portal abre.
--
-- Se crean AHORA justamente porque las tablas están vacías: crear un índice
-- sobre una tabla de cien millones de filas bloquea escrituras mientras se
-- construye, y entonces hay que usar CREATE INDEX CONCURRENTLY fuera de una
-- transacción y con la mitad de cuidado. Ahora cuesta milisegundos.
--
-- Los índices sueltos de client_id se quedan: sirven para los conteos y para
-- las consultas que no ordenan por fecha, y ocupan poco.

create index if not exists leads_client_created_idx
  on public.leads (client_id, created_at desc);

create index if not exists calls_client_created_idx
  on public.calls (client_id, created_at desc);

create index if not exists lead_events_client_created_idx
  on public.lead_events (client_id, created_at desc);

create index if not exists audit_logs_client_created_idx
  on public.audit_logs (client_id, created_at desc);

-- El embudo del portal filtra por fase dentro de la empresa. Es la segunda
-- consulta más repetida después del listado por fecha.
create index if not exists leads_client_status_created_idx
  on public.leads (client_id, status, created_at desc);

-- El recorrido de un contacto se lee por contacto, no por empresa: el índice
-- de lead_id solo no basta porque además se filtra por empresa desde que se
-- cerró la fuga entre clientes.
create index if not exists lead_events_client_lead_idx
  on public.lead_events (client_id, lead_id, created_at desc);;
