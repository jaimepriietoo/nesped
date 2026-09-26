# Production Runbook

## 1. Preflight local

Run the preflight before every deploy:

```bash
npm run verify:prod
```

This checks:
- critical environment variables
- Next production build
- route and portal integration safety at compile time
- 2FA and voice compliance prerequisites
- observability and incident-response prerequisites

## 2. Rotate secrets first

If any token has ever been pasted in chat, screen-shared, committed, or exposed in a screenshot, rotate it before deploying:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NESPED_SESSION_SECRET`
- `NESPED_TOTP_ENCRYPTION_KEY`
- `INTERNAL_API_TOKEN`
- `CRON_SECRET` (y su copia en Supabase Vault; ver §10)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TWILIO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `VERCEL_TOKEN`
- `RESEND_API_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`

## 3. Environment parity

Make sure the same critical variables exist in:

- local `.env.local`
- Vercel production environment
- Railway (sólo mientras siga de respaldo temporal del latido de la cola; ver
  §10). Ya no atiende llamadas.

Recommended observability variables:

- `OPS_ALERT_WEBHOOK_URL`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `PRIVACY_CONTACT_EMAIL`
- `VOICE_PRIVACY_URL`
- `RECORDING_RETENTION_DAYS`
- `TRANSCRIPT_RETENTION_DAYS`

Use:

```bash
node scripts/validate-env.mjs
```

## 4. Deploy order

`main` está protegida: nada llega a producción sin pasar por una pull
request con el check `verificar` en verde (eslint, unidad, build, e2e), y
no se puede hacer force push ni borrarla. Vercel despliega producción desde
`main` al fusionar. Antes de aplicar una migración que quite algo, ver
`docs/copias-y-recuperacion.md`.

1. Crear `NESPED_TOTP_ENCRYPTION_KEY` (32 bytes, hexadecimal o base64) en
   Vercel. Debe ser distinta de sesión, Supabase y tokens internos.
2. Aplicar las migraciones aditivas de la PR. En esta versión deben existir
   `auth_totp_factors` y `mensajes_salientes_idempotentes` antes de publicar
   el código; no contienen datos de clientes ni eliminan columnas.
3. Deploy Next app to Vercel (fusionar la PR en `main`)
4. Comprobar que el latido de la cola sigue vivo: `nesped-procesar-cola` en
   Supabase (§10) y, mientras siga de respaldo, el servicio de Railway
   (`voice-server.js`). Railway ya no lleva audio ni recibe llamadas.
5. Confirm Stripe and Twilio webhooks still target the right production URLs

## 5. Smoke test after deploy

Unauthenticated smoke test:

```bash
npm run smoke -- https://tu-dominio.com
```

Authenticated smoke test:

```bash
SMOKE_TEST_EMAIL=owner@cliente.com \
SMOKE_TEST_PASSWORD='tu-password' \
npm run smoke -- https://tu-dominio.com
```

## 6. Manual production checks

- login and logout
- owner/admin login with 2FA code delivery
- alta TOTP, login con TOTP, rechazo del mismo código reutilizado y baja con
  TOTP o código de recuperación
- `/portal`
- contratar plan
- gestionar facturación
- checkout success -> setup account
- llamada demo
- aviso legal reproducido antes de la conversación útil
- recording visible in portal
- WhatsApp webhook
- nightly automation
- billing portal redirect

## 7. Operational endpoints

- App readiness: `/api/ops/readiness`
- Incident test: `POST /api/ops/incident-test`
- Portal health: `/api/portal/health`
- Salud completa (incluye si la cola lleva más de 15 min sin latido): `/api/ops/salud`
- Latido de la cola: `cron.job_run_details` y `net._http_response` (§10)
- Servicio de fondo en Railway, mientras siga de respaldo: `/healthz`
- Voice compliance page: `/legal/voice-compliance`

## 8. E2E and rate limiting

- Playwright public/login/portal shell: `npm run test:e2e`
- Si escalas la capa pública, configura:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- Si quieres alertas operativas por webhook, configura:
  - `OPS_ALERT_WEBHOOK_URL`
- Si quieres observabilidad seria de errores y traces, configura:
  - `SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

Palancas de emergencia (sin desplegar):

- `NESPED_SIN_CORREO=si` — no sale ningún correo (avisos a departamentos,
  restablecer contraseña); queda apuntado como omitido. Para entornos de
  prueba con datos reales.
- `WEBHOOKS_EN_LINEA=si` — los webhooks de ElevenLabs y WhatsApp se procesan
  dentro de la petición, como antes de la bandeja. Para cuando la cola esté
  parada y haya que atenderlos ya. Quitarla cuando la cola vuelva.
- `ajustes_plataforma` (tabla) — `pausa_global`, `pausa_ia`, `pausa_llamadas`;
  ver `docs/cuando-se-cae-algo.md`.

## 9. Incident checklist

If production breaks:

1. Check Vercel deploy logs
2. Comprobar el latido de la cola (§10: `cron.job_run_details`,
   `net._http_response`) y, mientras siga de respaldo, los logs de Railway
3. Hit `/api/ops/readiness` y `/api/ops/salud`
4. Confirm env variables still exist after redeploy
5. Confirm Twilio and Stripe signatures are still valid
6. Run smoke test again against production
7. Trigger `POST /api/ops/incident-test` from an owner/admin session to verify webhook + Sentry delivery

## 10. Latido de la cola: Supabase Cron en lugar de Railway

### Qué es y por qué

`/api/cola/procesar` ejecuta los trabajos de fondo: correos de avisos e
informes, copias de grabaciones, webhooks entrantes y salientes,
clasificación de contactos, automatismos (cada 15 min) y mantenimiento
diario. Alguien tiene que llamarlo cada 30 segundos; la ejecución siempre
ocurre en funciones de Vercel.

Hasta ahora lo llamaba Railway (`voice-server.js` + `lib/server/latido-cola.cjs`);
el cron de `vercel.json` sólo corre una vez al día en el plan Hobby.

La sustitución es un trabajo de **Supabase Cron**, `nesped-procesar-cola`,
cada 30 segundos, que toma el secreto de **Vault** y llama a la ruta. El
cómo está en la cabecera de la migración,
`supabase/migrations/20260926100000_latido_cola_en_supabase.sql`, y la
vuelta atrás en `supabase/reversiones/20260926100000_latido_cola_en_supabase.sql`.
Quién puede llamar a la ruta lo decide `requireColaRequest`
(`lib/server/internal-api.js`); `CRON_SECRET` sólo abre esta ruta.

Tener Supabase y Railway a la vez **no duplica trabajo**: `tomar_trabajos()`
reparte con `for update skip locked` y el mantenimiento y el barrido de
automatismos entran con clave única. Lo prueba
`tests/unidad/cola-latido.test.mjs`.

### Lo que hace el propietario a mano (nadie más ve el valor)

1. **Generar el secreto** en tu máquina y copiarlo al portapapeles sin que
   salga en pantalla:

   ```bash
   openssl rand -hex 32 | tr -d '\n' | pbcopy
   ```

2. **Vercel** → Project `nesped` → Settings → Environment Variables → Add:
   `CRON_SECRET`, pegar, marcar *Sensitive*, entornos **Production** (y
   Preview si se quiere probar allí). **En claro, no en sobre KMS**: Vercel
   Cron manda el valor tal cual está guardado, y un `kms:v1:…` no coincidiría.
3. **Supabase** → Project Settings → Vault → Secrets → *Add new secret*,
   con el nombre que lee la migración y el **mismo** valor, sin espacios ni
   salto de línea. No usar `vault.create_secret` en el editor SQL: la
   sentencia con el valor queda en el historial de consultas.
4. Vaciar el portapapeles (`pbcopy < /dev/null`).
5. Comprobar sólo que existe (`vault.secrets`, columna `name`), nunca su
   valor.

Para rotarlo, cambiar Vault y Vercel (y volver a desplegar Vercel) seguidos;
en el hueco la cola espera, sin perder nada.

### Despliegue, por fases (no saltarse ninguna)

**Fase A — encender el latido de Supabase con Railway encendido.**

1. Pasos manuales 1–5 de arriba.
2. Fusionar la PR y comprobar que el cron diario de Vercel responde 200.
3. Aplicar la migración (conector de Supabase o panel). Si el secreto ya
   está en Vault, el trabajo queda **activo**; si no, queda **inactivo** y se
   activa con:

   ```sql
   select cron.alter_job((select jobid from cron.job where jobname = 'nesped-procesar-cola'), active := true);
   ```

4. `npm run volcar:migraciones` para llevar el SQL aplicado a
   `supabase/migrations/historico/`, y commit del volcado.
5. Mantener **Railway encendido**.
6. Comprobar las ejecuciones (deben salir cada ~30 s y `succeeded`):

   ```sql
   select start_time, status, return_message
     from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'nesped-procesar-cola')
    order by start_time desc limit 20;
   ```

7. Comprobar las respuestas HTTP sin mirar cabeceras (deben ser 200):

   ```sql
   select status_code, timed_out, error_msg, count(*), max(created)
     from net._http_response
    where created > now() - interval '15 minutes'
    group by 1, 2, 3;
   ```

8. Logs de Vercel filtrando `/api/cola/procesar`: POST cada ~30 s desde
   Supabase además de los de Railway, todos 200. No exportar ni pegar
   cabeceras.
9. La cola no acumula trabajos vencidos de más de 15 minutos:

   ```sql
   select count(*) as vencidos_15min
     from public.trabajos
    where estado = 'pendiente' and no_antes_de < now() - interval '15 minutes';
   ```

**Fase B — los dos latidos juntos, 24 a 48 horas.**

- Cero duplicados. Dos pasadas no pueden coger la misma fila; lo que sí
  daría `intentos > 1` es un reintento tras fallo o un rescate de un trabajo
  colgado. Con la cola sana deben ser pocos y explicables:

  ```sql
  select tipo, count(*) filter (where estado = 'hecho' and intentos > 1) as hechos_con_reintento,
         count(*) filter (where estado = 'fallido') as fallidos
    from public.trabajos
   where creado_en > now() - interval '48 hours'
   group by 1 order by 1;
  ```

  Cada `hechos_con_reintento` se mira en los logs de Vercel por su `job_id`
  (`conContexto` lo añade a cada línea) antes de pasar a la fase C: tiene que
  haber un fallo o un rescate que lo explique. Y ningún destinatario debe
  haber recibido dos veces el mismo aviso.
- Cero backlog envejecido (consulta del paso 9) y `/api/ops/salud` sin el
  aviso "La cola de trabajos no se está procesando".
- Prueba de extremo a extremo: una llamada real al número de prueba (llega al
  portal con **grabación copiada** y **contacto clasificado**, y el
  departamento recibe el **correo**), un **webhook saliente** entregado a un
  destino de prueba y un **automatismo** que salta en su barrido.
- Un `mantenimiento` diario en estado `hecho`.

**Fase C — pausar Railway, sin borrarlo.**

- Railway → servicio → *Settings* → reducir a 0 réplicas o *Pause*. No
  borrar el servicio ni sus variables.
- Observar al menos 24 horas: `/api/ops/salud` en verde, consultas de la
  fase A limpias, un informe y un mantenimiento diario completados.
- Comprobar en los logs de Vercel que ya **no llega ningún POST con el
  token interno** a `/api/cola/procesar`: Railway ya no recibe ni hace
  tráfico.

**Fase D — sólo con autorización explícita del propietario.**

- Cancelar Railway.
- Rotar lo que estaba también en Railway —`INTERNAL_API_TOKEN` (y con él la
  cabecera de las herramientas en ElevenLabs), `SUPABASE_SERVICE_ROLE_KEY`,
  y `SENTRY_DSN` si se quiere— y borrar allí sus variables antes de cerrar la
  cuenta.
- Otra PR, aparte: retirar `voice-server.js`, `lib/server/latido-cola.cjs`,
  sus pruebas, las menciones a Railway en la documentación y a Railway como
  subencargado en `lib/legal.js` y `docs/rgpd/`.

### Aceptación final (con pruebas, no con intuición)

Mismo intervalo de 30 s · cola sin trabajos vencidos de más de 15 min ·
correos enviados · grabaciones copiadas · webhooks entregados · automatismos
ejecutados · mantenimiento diario completado · rollback probado (pausar y
reactivar el trabajo con `cron.alter_job` y ver que Railway, o el cron, lo
recoge) · Railway sin tráfico antes de cancelarlo.

### Pausar, reactivar, revertir

- Pausar: `select cron.alter_job((select jobid from cron.job where jobname = 'nesped-procesar-cola'), active := false);`
- Reactivar: lo mismo con `active := true`.
- Revertir del todo: ejecutar
  `supabase/reversiones/20260926100000_latido_cola_en_supabase.sql`. Quita el
  trabajo con `cron.unschedule` y la función; **no borra ningún trabajo de la
  cola**, ni las extensiones, ni el secreto de Vault. Antes, asegurarse de
  que Railway está encendido.
- Nunca `insert`/`update`/`delete` sobre `cron.job`: sólo `cron.schedule`,
  `cron.alter_job` y `cron.unschedule`.
- `pausa_global` en `ajustes_plataforma` sigue funcionando igual: el latido
  llega, la ruta ve la pausa y no coge nada.
