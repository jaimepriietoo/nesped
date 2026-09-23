# Secretos en sobres KMS

Desde el 21-09-2026 los secretos del servidor pueden ir en Vercel **cerrados
en un sobre** (`kms:v1:…`) que sólo abre AWS KMS con la clave
`nesped-secretos` (región `eu-west-1`). Quien copie las variables de Vercel
se lleva sobres; para abrirlos hace falta una identidad AWS autorizada que
sólo pueda `Encrypt`/`Decrypt` sobre esa clave y deje rastro en CloudTrail.

## Cómo funciona

- `instrumentation.js` llama a `abrirSobresDeEntorno()` al arrancar (sólo
  en Node). Abre los sobres de la lista `SECRETOS_EN_SOBRE` y deja el valor
  en `process.env`. El resto del código no cambia.
- Falla cerrado: si KMS no responde, la app no arranca. Mejor caída que un
  secreto a medias.
- Cada sobre lleva el nombre de la variable como contexto: el de
  `STRIPE_SECRET_KEY` no se abre como `TWILIO_AUTH_TOKEN`.
- Lo que lee el proxy en Edge (`NESPED_SESSION_SECRET`) **no puede ir en
  sobre**: Edge no habla con KMS. Queda en claro, y es la deuda pendiente
  (firma asimétrica de sesiones para que Edge sólo tenga la pública).

## Pasar una variable a sobre

```bash
npm run cerrar:sobre NOMBRE_DE_LA_VARIABLE
```

Pide el valor por teclado sin mostrarlo, lo cierra, comprueba que se abre y
escribe el sobre. Se pega en Vercel en la variable del mismo nombre
(Production y Preview) y se redespliega. Para volver atrás: poner el valor en
claro.

Orden recomendado: `SUPABASE_JWT_SECRET` y `NESPED_TOTP_ENCRYPTION_KEY`
primero (son las que fabrican accesos), luego `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `ELEVENLABS_API_KEY`,
`OPENAI_API_KEY`, `RESEND_API_KEY`.

## Variables necesarias

`AWS_REGION=eu-west-1` y `NESPED_KMS_KEY_ID` (el ARN de la clave). En
Production **y** Preview. La identidad se resuelve con la cadena estándar del
SDK de AWS: usa preferentemente credenciales temporales del runtime o web
identity. `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` sólo deben mantenerse
como transición si la plataforma todavía no ofrece identidad temporal; no
son un requisito de la aplicación.

## Coste

Una clave (1 $/mes) y una apertura por variable y arranque de función,
dentro de las 20.000 gratuitas al mes.
