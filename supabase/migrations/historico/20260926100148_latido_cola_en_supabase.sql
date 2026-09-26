-- El latido de la cola, desde la propia base de datos.
--
-- POR QUÉ. /api/cola/procesar ejecuta los trabajos de fondo: correos,
-- copias de grabaciones, webhooks entrantes y salientes, clasificación,
-- automatismos y mantenimiento. Alguien tiene que llamarlo cada medio minuto.
-- Hasta hoy lo hacía un proceso en Railway (voice-server.js con
-- lib/server/latido-cola.cjs), y el cron de Vercel en plan Hobby sólo corre
-- una vez al día. Supabase Cron admite intervalos en segundos y pg_net hace la
-- petición HTTP, así que el latido puede vivir donde ya viven los datos, sin
-- un servicio más que pagar. La ejecución de los trabajos no cambia: sigue en
-- funciones de Vercel.
--
-- QUÉ HACE.
--   · Activa pg_cron y pg_net. Aditivo: no toca ninguna tabla de la aplicación.
--   · Crea private.latir_cola(), que en cada latido lee el secreto de Vault y
--     hace un POST a https://www.nesped.com/api/cola/procesar con el secreto
--     en la cabecera Authorization, nunca en la URL, y un techo de 55 s.
--     Va a www a propósito: nesped.com redirige con 307 y un POST no la sigue.
--   · Programa un único trabajo, 'nesped-procesar-cola', cada 30 segundos.
--
-- SIN SECRETOS AQUÍ. El secreto no está en este fichero ni en cron.job: el
-- comando programado sólo llama a la función y la función lo lee de
-- vault.decrypted_secrets en ese momento. Lo crea el propietario a mano desde
-- el panel de Supabase con el mismo valor que CRON_SECRET en Vercel
-- (docs/production-runbook.md, "Latido de la cola").
--
-- SI EL SECRETO AÚN NO EXISTE. La migración no falla: deja el trabajo
-- programado pero INACTIVO. Y si alguien lo activa sin secreto, o con uno de
-- menos de 32 caracteres, la función falla cerrada: lanza un error que queda
-- en cron.job_run_details y no envía ninguna petición.
--
-- EN PARALELO CON RAILWAY. Tener los dos latidos a la vez durante la
-- transición no duplica trabajo: tomar_trabajos() reparte con
-- `for update skip locked`, así que dos pasadas simultáneas nunca cogen la
-- misma fila, y el mantenimiento y el barrido de automatismos entran con
-- clave única.
--
-- ACTIVAR, PAUSAR, REVERTIR. Siempre con las funciones de pg_cron, nunca
-- escribiendo en cron.job:
--   activar   select cron.alter_job((select jobid from cron.job where jobname = 'nesped-procesar-cola'), active := true);
--   pausar    select cron.alter_job((select jobid from cron.job where jobname = 'nesped-procesar-cola'), active := false);
--   revertir  supabase/reversiones/20260926100000_latido_cola_en_supabase.sql
-- Revertir no borra ningún trabajo de la cola ni desactiva las extensiones:
-- quitar pg_cron borraría cualquier otro trabajo programado de la base.
--
-- HISTORIAL. cron.job_run_details no se poda solo y este trabajo escribe
-- 2.880 filas al día. La propia función poda, una vez por hora, lo suyo de más
-- de siete días. net._http_response lo poda pg_net a las seis horas.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function private.latir_cola()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_secreto text;
  v_peticion bigint;
begin
  select trim(s.decrypted_secret)
    into v_secreto
    from vault.decrypted_secrets s
   where s.name = 'nesped_cola_cron_secret'
   limit 1;

  -- Falla cerrada, y sin decir nada del valor.
  if v_secreto is null or length(v_secreto) < 32 then
    raise exception 'Latido de la cola parado: falta el secreto nesped_cola_cron_secret en Vault o tiene menos de 32 caracteres';
  end if;

  -- Una vez por hora, poda el historial propio. Si no puede, el latido sigue.
  if extract(minute from now()) = 17 and extract(second from now()) < 30 then
    begin
      delete from cron.job_run_details d
       using cron.job j
       where j.jobname = 'nesped-procesar-cola'
         and d.jobid = j.jobid
         and d.end_time < now() - interval '7 days';
    exception when others then
      raise warning 'Latido de la cola: no se pudo podar su historial (%)', sqlstate;
    end;
  end if;

  select net.http_post(
    url := 'https://www.nesped.com/api/cola/procesar',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secreto
    ),
    timeout_milliseconds := 55000
  ) into v_peticion;

  return v_peticion;
end;
$$;

-- Sólo la ejecuta su dueño, que es quien corre el trabajo de pg_cron. Ni la
-- API ni la aplicación pueden dispararla ni, por tanto, leer el secreto.
revoke all on function private.latir_cola() from public, anon, authenticated, service_role;

do $$
declare
  v_trabajo bigint;
  v_hay_secreto boolean;
begin
  select exists (select 1 from vault.secrets where name = 'nesped_cola_cron_secret')
    into v_hay_secreto;

  v_trabajo := cron.schedule(
    'nesped-procesar-cola',
    '30 seconds',
    'select private.latir_cola()'
  );

  if not v_hay_secreto then
    perform cron.alter_job(job_id := v_trabajo, active := false);
    raise notice 'nesped-procesar-cola queda programado e INACTIVO: falta el secreto nesped_cola_cron_secret en Vault';
  end if;
end;
$$;
;
