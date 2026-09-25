# Rotación de secretos

Cada secreto se cambia cada 90 días, y **en el momento** si alguien con acceso
deja el equipo o hay sospecha de filtración. Los que van en sobre KMS se
cierran con `pbpaste | npm run -s cerrar:sobre NOMBRE` y se pegan en Vercel
(Production y Preview); después se vuelve a publicar la web.

| Secreto | Dónde se genera | En sobre KMS | Última rotación |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` | Panel de Supabase (API keys) | Sí | [ ] |
| `NESPED_SESSION_SECRET` | `openssl rand -hex 32` | No (cambiarlo cierra todas las sesiones) | [ ] |
| `INTERNAL_API_TOKEN` | `openssl rand -hex 32`; cambiarlo también en ElevenLabs (cabecera de las herramientas) y Railway | Sí | [ ] |
| `NESPED_TOTP_ENCRYPTION_KEY` | Ver `docs/sobres-kms.md` (rotarla exige recifrar los factores) | Sí | [ ] |
| `NESPED_DATA_ENCRYPTION_KEY` | `npm run recifrar:datos` con la anterior en `…_ANTERIOR` | Sí | 24-09-2026 |
| `STRIPE_SECRET_KEY` | Panel de Stripe | Sí | [ ] |
| `TWILIO_AUTH_TOKEN` | Consola de Twilio (token secundario → promover) | Sí | [ ] |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_WEBHOOK_SECRET` | Panel de ElevenLabs | Sí / No | [ ] |
| `OPENAI_API_KEY` | Panel de OpenAI | Sí | [ ] |
| `RESEND_API_KEY` | Panel de Resend | Sí | [ ] |
| Llave AWS local de `nesped-vercel` (sólo en `.env.local`) | IAM | — | 24-09-2026 |

No hay llaves fijas de AWS en Vercel: los sobres se abren con OIDC
(`AWS_ROLE_ARN`), que da credenciales de una hora.
