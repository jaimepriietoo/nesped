-- Una llamada por conversación y empresa.
--
-- El webhook post-call de ElevenLabs buscaba la llamada por (client_id,
-- call_sid) y, si no la encontraba, la insertaba. Dos entregas del mismo
-- webhook a la vez —ElevenLabs reintenta, y reintenta rápido— pasaban las dos
-- la comprobación y metían dos filas: dos llamadas, dos consumos, dos eventos
-- en el contacto. Stripe ya tenía el patrón correcto (reclamar_webhook);
-- ElevenLabs no lo usaba.
--
-- Parcial sobre call_sid no nulo: las llamadas sin identificador de
-- conversación existen y no pueden colisionar entre sí.
--
-- Comprobado antes de crearlo: cero duplicados en las filas existentes.
create unique index if not exists calls_client_sid_unica
  on public.calls (client_id, call_sid)
  where call_sid is not null;
