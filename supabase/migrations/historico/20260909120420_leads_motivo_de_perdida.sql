-- Motivo por el que se pierde una operación.
--
-- Sin esta columna, el portal registraba QUE se perdió pero nunca POR QUÉ, así
-- que no había forma de contestar a la única pregunta que hace mejorar: qué nos
-- está costando las operaciones. Se guarda como texto de una lista corta, no
-- libre, para poder agrupar: veinte redacciones distintas de "caro" no se
-- pueden sumar.
alter table public.leads
  add column if not exists lost_reason text;

comment on column public.leads.lost_reason is
  'Motivo de pérdida: precio, competencia, seguimiento, tiempo, no_encaja, sin_respuesta, otro. Solo tiene sentido cuando status = lost.';

-- Los análisis agrupan por motivo dentro de un cliente y filtrando por perdidas.
create index if not exists leads_lost_reason_idx
  on public.leads (client_id, lost_reason)
  where status = 'lost';;
