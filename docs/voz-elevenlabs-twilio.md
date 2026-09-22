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

## Estado del número

**+34 883 827 930, conectado el 17 de septiembre de 2026** a la empresa
`fibergreen`: está en la cuenta de Twilio `ACdf93…`, importado en ElevenLabs
(`phnum_4101m2qx791xenrr62vvdar1apq0`) y asignado al agente
`Nesped · Recepción`. Twilio manda las llamadas a
`https://api.elevenlabs.io/twilio/inbound_call`.

Antes de descolgar, ElevenLabs llama a
`https://www.nesped.com/api/voice/elevenlabs/context` (webhook de inicio,
configurado en el workspace con el token interno) y recibe las variables
dinámicas: `nombre_empresa`, `client_id`, el contacto conocido si lo hay, si
estamos en horario, y `contexto_empresa`, que es lo configurado en "Tu IA".
Así el mismo agente atiende a cada empresa como ella decidió.

Para cambiar el número de empresa o conectar otro:
`npm run conectar:numero -- --empresa=<id>` (`scripts/conectar-numero.mjs`),
con `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_PHONE_NUMBER` de la
cuenta que tiene el número en `.env.local`. Con `--solo-comprobar` no toca
nada.

**Ojo con el cortafuegos de Vercel.** Si el proyecto tiene activado el modo
de desafío (Attack Challenge Mode / Bot Protection en "challenge"), los
webhooks de ElevenLabs, Twilio y Stripe reciben un 403 con una página de
verificación y las llamadas no se guardan. Debe estar apagado o con una
regla de paso para `/api/`.

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
  "phone": "<LLM Prompt>",
  "email": "<LLM Prompt>",
  "city": "<LLM Prompt>",
  "address": "<LLM Prompt>",
  "need": "<LLM Prompt>",
  "preference": "<LLM Prompt>",
  "summary": "<LLM Prompt>",
  "notes": "<LLM Prompt>"
}
```

Cada llamada es un expediente independiente. Aunque `leadId` enlace la
llamada con una ficha existente, la herramienta sólo debe mandar datos
obtenidos o confirmados en la conversación actual. La única excepción es
`name`: puede usar el nombre conocido para saludar e identificar la ficha.
Nunca se rellenan `phone`, `email`, `city`, `address`, `need`, `preference`,
`summary` ni `notes` desde una llamada anterior.

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
- `name` -> LLM Prompt -> nombre dado ahora o nombre conocido; es el único dato histórico permitido
- `phone` -> LLM Prompt -> teléfono que la persona ha dado o confirmado en esta llamada
- `email` -> LLM Prompt -> correo que la persona ha dado o confirmado en esta llamada
- `city` -> LLM Prompt -> localidad o zona dada o confirmada en esta llamada
- `address` -> LLM Prompt -> dirección del servicio dada o confirmada en esta llamada, si hace falta
- `need` -> LLM Prompt -> necesidad expresada en esta llamada
- `preference` -> LLM Prompt -> preferencia expresada en esta llamada
- `summary` -> LLM Prompt -> resumen únicamente de esta llamada
- `notes` -> LLM Prompt -> notas operativas únicamente de esta llamada

Assignments recomendados:

- `lead_id <- response.leadId`
- `lead_name <- response.leadName`
- `lead_need <- response.leadNeed`
- `lead_status <- response.leadStatus`
- `lead_summary <- response.leadSummary`

Haz que el agente llame a esta tool después de volver a preguntar los datos
necesarios, y de nuevo antes de despedirse si después apareció información
nueva. Varias llamadas a la herramienta dentro de la misma conversación se
unen por `conversationId`; otra conversación nunca reutiliza esos valores.

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
