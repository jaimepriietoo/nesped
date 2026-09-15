-- Índices para paginar por cursor.
--
-- El cursor ordena por (created_at, id) dentro de una empresa. El índice
-- (client_id, created_at) que había servía para la fecha pero no para el
-- desempate por id: con dos filas del mismo instante, Postgres tenía que
-- filtrar aparte. Ahora el índice lleva las tres columnas y la consulta del
-- cursor es un recorrido de índice, cueste lo que cueste la tabla.
--
-- Los índices (client_id, created_at) antiguos sobran: el nuevo los
-- contiene como prefijo. Se quitan para no pagar dos veces cada escritura.
create index if not exists leads_cursor_idx on public.leads(client_id, created_at desc, id desc);
create index if not exists calls_cursor_idx on public.calls(client_id, created_at desc, id desc);
create index if not exists audit_logs_cursor_idx on public.audit_logs(client_id, created_at desc, id desc);
create index if not exists lead_events_cursor_idx on public.lead_events(client_id, created_at desc, id desc);
drop index if exists public.leads_client_created_idx;
drop index if exists public.calls_client_created_idx;
drop index if exists public.audit_logs_client_created_idx;
drop index if exists public.lead_events_client_created_idx;
