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

## 2. Rotate secrets first

If any token has ever been pasted in chat, screen-shared, committed, or exposed in a screenshot, rotate it before deploying:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NESPED_SESSION_SECRET`
- `INTERNAL_API_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TWILIO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `VERCEL_TOKEN`
- `RESEND_API_KEY`

## 3. Environment parity

Make sure the same critical variables exist in:

- local `.env.local`
- Vercel production environment
- Railway voice server environment

Use:

```bash
node scripts/validate-env.mjs
```

## 4. Deploy order

1. Deploy Next app to Vercel
2. Deploy `voice-server.js` service to Railway
3. Confirm public `BASE_URL` still points to the voice service
4. Confirm Stripe and Twilio webhooks still target the right production URLs

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
- Portal health: `/api/portal/health`
- Voice server liveness: `/healthz`
- Voice compliance page: `/legal/voice-compliance`

## 8. E2E and rate limiting

- Playwright public/login/portal shell: `npm run test:e2e`
- Si escalas la capa pública, configura:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- Si quieres alertas operativas sin Sentry, configura:
  - `OPS_ALERT_WEBHOOK_URL`

## 9. Incident checklist

If production breaks:

1. Check Vercel deploy logs
2. Check Railway voice logs
3. Hit `/api/ops/readiness`
4. Confirm env variables still exist after redeploy
5. Confirm Twilio and Stripe signatures are still valid
6. Run smoke test again against production
