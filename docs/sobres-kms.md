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

`AWS_REGION=eu-west-1` y `NESPED_KMS_KEY_ID` (el ARN de la clave), en
Production **y** Preview. La identidad AWS sale de una de estas, por orden:

1. **`AWS_ROLE_ARN` (la buena).** Vercel cambia su token OIDC por
   credenciales de una hora (`AssumeRoleWithWebIdentity`). En Vercel no
   queda ninguna clave AWS fija: quien copie las variables se lleva sobres
   y un ARN, y con eso no abre nada.
2. `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`: la transición. Una copia
   entera del entorno trae los sobres **y** la llave que los abre.
3. La cadena estándar del SDK (perfil local, etc.): para scripts en local.

El log `kms.sobres_abiertos` dice cuál se usó (`identidad`: `oidc_vercel`,
`claves_estaticas` o `cadena_sdk`).

## Pasar a OIDC (de claves fijas a credenciales de una hora)

Datos de este proyecto: cuenta AWS `190884857032`, equipo de Vercel
`jaimepriietoos-projects`, proyecto `nesped`, región `eu-west-1`.

1. **Vercel** → proyecto `nesped` → Settings → Security → *Secure Backend
   Access with OIDC Federation*: activado, modo **Team**.
2. **AWS IAM** → Identity providers → Add provider → *OpenID Connect*:
   - Provider URL: `https://oidc.vercel.com/jaimepriietoos-projects`
   - Audience: `https://vercel.com/jaimepriietoos-projects`
3. **AWS IAM** → Roles → Create role → *Web identity* → ese proveedor y esa
   audiencia. Nombre: `nesped-vercel-kms`. Política de confianza (sustituye
   la que genera el asistente):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "Federated": "arn:aws:iam::190884857032:oidc-provider/oidc.vercel.com/jaimepriietoos-projects" },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": { "oidc.vercel.com/jaimepriietoos-projects:aud": "https://vercel.com/jaimepriietoos-projects" },
         "StringLike": { "oidc.vercel.com/jaimepriietoos-projects:sub": [
           "owner:jaimepriietoos-projects:project:nesped:environment:production",
           "owner:jaimepriietoos-projects:project:nesped:environment:preview"
         ] }
       }
     }]
   }
   ```

   Permisos: una política en línea que sólo permita `kms:Decrypt` sobre la
   clave `nesped-secretos` (el ARN de `NESPED_KMS_KEY_ID`). `kms:Encrypt`
   no hace falta en Vercel: los sobres se cierran en local.
4. **Vercel** → `AWS_ROLE_ARN=arn:aws:iam::190884857032:role/nesped-vercel-kms`
   **sólo en Preview**, redesplegar una preview y comprobar en el log
   `kms.sobres_abiertos` que `identidad` es `oidc_vercel` y que abre los
   nueve sobres. Los sobres se abren al arrancar, fuera de una petición: si
   el token OIDC no estuviera disponible en ese momento, la preview no
   arrancaría y producción no se habría tocado.
5. Si va bien: `AWS_ROLE_ARN` también en Production, redesplegar, comprobar
   el mismo log. Después, **borrar** `AWS_ACCESS_KEY_ID` y
   `AWS_SECRET_ACCESS_KEY` de Vercel y desactivar esa access key del usuario
   `nesped-vercel` en IAM (se puede conservar para `cerrar-sobre` en local,
   con sólo `kms:Encrypt`/`kms:Decrypt`).

## Coste

Una clave (1 $/mes) y una apertura por variable y arranque de función,
dentro de las 20.000 gratuitas al mes.
