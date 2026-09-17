# La voz de Nesped: ElevenLabs sobre Twilio

Quién hace qué: **Twilio** pone el número, **ElevenLabs Agents** lleva la
conversación entera, y **Nesped** guarda contexto, contactos y llamadas.

## Qué se retiró, y por qué importa

Hasta ahora la conversación la hacíamos nosotros: Telnyx recibía la llamada,
mandaba el audio por un WebSocket al servidor de voz de Nesped, ese servidor lo
pasaba a OpenAI Realtime y devolvía la voz. Eran unas mil ochocientas líneas
puenteando audio en tiempo real, que era la parte más frágil del producto.

Eso ya no existe. ElevenLabs tiene integración nativa con Twilio: se le importa
el número y se encarga del audio de punta a punta. `voice-server.js` pasó de
2.109 líneas a unas 300, y lo único que le queda es empujar la cola de trabajos
—que hace falta porque los cron de Vercel en plan Hobby corren una vez al día—.

Telnyx desapareció del proyecto. También llevaba los SMS y los WhatsApp, y esos
pasaron a Twilio (`lib/server/twilio.js`).

## Lo que falta para que suene el teléfono

**Hay número: +34 883 827 930** (desde el 17 de septiembre de 2026). Está en
**otra cuenta de Twilio**, no en la que tiene Nesped en `.env.local`/Vercel
(`AC9ff7…`, que sigue con cero líneas). Hasta que no se conecte, no entra ni
sale ninguna llamada. Los pasos, y el guion que los hace:

1. En `.env.local` y en Vercel, poner `TWILIO_ACCOUNT_SID` y
   `TWILIO_AUTH_TOKEN` **de la cuenta que tiene el número**, y
   `TWILIO_PHONE_NUMBER=+34883827930`. (Los WhatsApp/SMS salen de la misma
   cuenta: si la otra cuenta no tiene remitente de WhatsApp, esa parte
   quedará sin conectar, como hoy.)
2. `npm run conectar:numero -- --empresa=<id>` (`scripts/conectar-numero.mjs`):
   comprueba que el número está en esa cuenta y tiene voz, lo importa en
   ElevenLabs y lo asigna al agente `Nesped · Recepción` (ElevenLabs deja
   configurado el número en Twilio), y guarda `clients.twilio_number` en la
   empresa. Con `--solo-comprobar` no cambia nada.
3. Poner en Vercel el `ELEVENLABS_PHONE_NUMBER_ID` que imprime el guion y
   redesplegar. Sin él, la llamada de demostración contesta 503 y el panel
   de salud marca la telefonía en amarillo, que es lo correcto.
4. Llamar al número. La llamada tiene que aparecer en Llamadas del portal de
   esa empresa en menos de un minuto de colgar.

El `+34983460825` que había en los seeds de `lib/clients.js` ya no es de
nadie y se ha quitado.

## Variables de entorno

En `Vercel`:

```env
INTERNAL_API_TOKEN=...
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
ELEVENLABS_PHONE_NUMBER_ID=...      # sale al importar el número
ELEVENLABS_WEBHOOK_SECRET=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+34...
TWILIO_WHATSAPP_NUMBER=+34...       # sólo si se usa WhatsApp
NEXT_PUBLIC_APP_URL=https://nesped.com
```

En `Railway` (el servicio de fondo, que ya no atiende llamadas):

```env
INTERNAL_API_TOKEN=...
NEXT_PUBLIC_APP_URL=https://nesped.com
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Webhook de WhatsApp

En la consola de Twilio, el número de WhatsApp apunta a:

`https://nesped.com/api/whatsapp/webhook`

Nesped comprueba la firma `X-Twilio-Signature` con HMAC-SHA1 sobre la URL
completa y los campos del cuerpo. Si el número está detrás de un proxy que
cambia el esquema, la firma no cuadrará: la ruta reconstruye la URL pública
desde `x-forwarded-proto` y `x-forwarded-host` precisamente por eso.

## Endpoints nuevos de Nesped

### 1. Contexto de llamada

`POST /api/voice/elevenlabs/context`

Autenticacion:

- `Authorization: Bearer <INTERNAL_API_TOKEN>`

Body recomendado:

```json
{
  "callerId": "{{system__caller_id}}",
  "calledNumber": "{{system__called_number}}",
  "conversationId": "{{system__conversation_id}}"
}
```

Respuesta util:

- `response.clientId`
- `response.brandName`
- `response.companySummary`
- `response.callerId`
- `response.calledNumber`
- `response.leadId`
- `response.leadName`
- `response.leadNeed`
- `response.leadStatus`
- `response.leadOwner`
- `response.leadSummary`
- `response.callObjective`
- `response.shouldCreateLead`

### 2. Upsert de lead durante la llamada

`POST /api/voice/elevenlabs/upsert-lead`

Autenticacion:

- `Authorization: Bearer <INTERNAL_API_TOKEN>`

Body recomendado:

```json
{
  "clientId": "{{client_id}}",
  "callerId": "{{caller_id}}",
  "calledNumber": "{{called_number}}",
  "conversationId": "{{system__conversation_id}}",
  "name": "<LLM Prompt>",
  "city": "<LLM Prompt>",
  "need": "<LLM Prompt>",
  "preference": "<LLM Prompt>",
  "summary": "<LLM Prompt>",
  "notes": "<LLM Prompt>"
}
```

Respuesta util:

- `response.leadId`
- `response.leadName`
- `response.leadNeed`
- `response.leadStatus`
- `response.leadSummary`
- `response.created`

### 3. Persistencia final post-call

`POST /api/voice/elevenlabs/post-call?secret=<ELEVENLABS_WEBHOOK_SECRET>`

Uso:

- configurar en `Workspace Settings > Webhooks > post_call_transcription`
- el payload final guarda la llamada en `calls` y anota el consumo de la empresa
- y deja evento de lead + audit log

## Configuracion en ElevenLabs

## Agent prompt

Usa variables dinamicas como estas:

```text
Eres la voz de {{brand_name}}.

Contexto del cliente:
{{company_summary}}

Contexto de la llamada:
{{call_objective}}

Si hay lead previo:
{{lead_summary}}

Si no existe lead, captura nombre, necesidad y ciudad antes de cerrar.
Si detectas una oportunidad clara, usa la herramienta de guardado de lead antes de terminar.
```

## Tool 1: `load_call_context`

- Tipo: `Webhook`
- Metodo: `POST`
- URL: `https://nesped.com/api/voice/elevenlabs/context`
- Auth: `Bearer token`
- Token: `INTERNAL_API_TOKEN`

Parametros:

- `callerId` -> Dynamic variable -> `system__caller_id`
- `calledNumber` -> Dynamic variable -> `system__called_number`
- `conversationId` -> Dynamic variable -> `system__conversation_id`

Assignments recomendados:

- `client_id <- response.clientId`
- `brand_name <- response.brandName`
- `company_summary <- response.companySummary`
- `caller_id <- response.callerId`
- `called_number <- response.calledNumber`
- `lead_id <- response.leadId`
- `lead_name <- response.leadName`
- `lead_need <- response.leadNeed`
- `lead_status <- response.leadStatus`
- `lead_owner <- response.leadOwner`
- `lead_summary <- response.leadSummary`
- `call_objective <- response.callObjective`
- `should_create_lead <- response.shouldCreateLead`

Haz que el agente llame a esta tool al principio de cada llamada.

## Tool 2: `upsert_call_lead`

- Tipo: `Webhook`
- Metodo: `POST`
- URL: `https://nesped.com/api/voice/elevenlabs/upsert-lead`
- Auth: `Bearer token`
- Token: `INTERNAL_API_TOKEN`

Parametros:

- `clientId` -> Dynamic variable -> `client_id`
- `callerId` -> Dynamic variable -> `caller_id`
- `calledNumber` -> Dynamic variable -> `called_number`
- `conversationId` -> Dynamic variable -> `system__conversation_id`
- `name` -> LLM Prompt -> nombre completo del caller
- `city` -> LLM Prompt -> ciudad o zona del caller
- `need` -> LLM Prompt -> necesidad o interes principal
- `preference` -> LLM Prompt -> preferencia relevante
- `summary` -> LLM Prompt -> resumen breve y util para el CRM
- `notes` -> LLM Prompt -> notas operativas cortas

Assignments recomendados:

- `lead_id <- response.leadId`
- `lead_name <- response.leadName`
- `lead_need <- response.leadNeed`
- `lead_status <- response.leadStatus`
- `lead_summary <- response.leadSummary`

Haz que el agente llame a esta tool en cuanto tenga datos suficientes para no perder el lead.

## Webhook final de ElevenLabs

En `Workspace Settings > Webhooks`:

- Event: `post_call_transcription`
- URL:

```text
https://nesped.com/api/voice/elevenlabs/post-call?secret=TU_ELEVENLABS_WEBHOOK_SECRET
```

Usa el mismo secreto que guardes como `ELEVENLABS_WEBHOOK_SECRET` en tus entornos.

## Conectar el número de Twilio

ElevenLabs importa números de Twilio de forma nativa: no hace falta SIP
trunking ni configurar TeXML ni webhooks de voz en Twilio. ElevenLabs se queda
con el número y atiende la llamada.

En ElevenLabs: **Phone Numbers → Import from Twilio**, con el SID de la cuenta
y el auth token. Después se asigna el número al agente `Nesped · Recepción`.

Guía oficial:

- `https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration`

Lo que devuelve la importación es un `phone_number_id`. Ese id es el que va en
`ELEVENLABS_PHONE_NUMBER_ID`, y es lo que usa `/api/demo-call` para lanzar la
llamada de prueba desde la portada.

## El recorrido completo de una llamada

1. Alguien marca el número de Twilio.
2. ElevenLabs coge la llamada; Twilio sólo pone la línea.
3. El agente llama a `load_call_context` y sabe de qué empresa es y si quien
   llama ya era un contacto.
4. Si aparece una oportunidad, llama a `upsert_call_lead` y el contacto se crea
   o se actualiza mientras se habla.
5. Al colgar, ElevenLabs manda `post_call_transcription`.
6. Nesped guarda la llamada, apunta el consumo de la empresa y el portal la
   enseña en Calidad de voz.

Nesped no toca el audio en ningún momento del recorrido.
