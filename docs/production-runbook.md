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
- Railway voice server environment

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
4. Deploy `voice-server.js` service to Railway
5. Confirm public `BASE_URL` still points to the voice service
6. Confirm Stripe and Twilio webhooks still target the right production URLs

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
- Voice server liveness: `/healthz`
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
2. Check Railway voice logs
3. Hit `/api/ops/readiness`
4. Confirm env variables still exist after redeploy
5. Confirm Twilio and Stripe signatures are still valid
6. Run smoke test again against production
7. Trigger `POST /api/ops/incident-test` from an owner/admin session to verify webhook + Sentry delivery
