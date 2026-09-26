-- Revertir supabase/migrations/20260926100000_latido_cola_en_supabase.sql.
--
-- Antes de ejecutarlo, confirmar que Railway (voice-server.js) sigue
-- encendido o que hay otro latido: sin ninguno, la cola se queda quieta hasta
-- el cron diario de Vercel.
--
-- Si sólo hace falta parar un rato, no se revierte: se pausa.
--   select cron.alter_job((select jobid from cron.job where jobname = 'nesped-procesar-cola'), active := false);
--
-- Qué NO toca, a propósito:
--   · public.trabajos: ni una fila. Lo pendiente sigue pendiente y lo recoge
--     el siguiente latido que haya.
--   · Las extensiones pg_cron y pg_net: quitarlas borraría cualquier otro
--     trabajo programado de la base.
--   · El secreto de Vault: lo borra el propietario desde el panel si quiere.
--   · cron.job_run_details: el historial se queda para poder mirar qué pasó.
--
-- El trabajo se quita con cron.unschedule, nunca escribiendo en cron.job.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'nesped-procesar-cola') then
    perform cron.unschedule('nesped-procesar-cola');
  end if;
end;
$$;

drop function if exists private.latir_cola();
