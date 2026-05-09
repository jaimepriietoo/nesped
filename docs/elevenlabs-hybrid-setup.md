# ElevenLabs Hybrid Setup

Objetivo: que `Telnyx` lleve el numero, `ElevenLabs` lleve la voz y `Nesped` siga guardando contexto, leads y llamadas.

## Arquitectura

- `Telnyx` recibe la llamada del numero real.
- `ElevenLabs Agents` atiende la conversacion por SIP trunk.
- `Nesped` expone herramientas HTTP para:
  - cargar contexto de cliente y lead
  - crear o actualizar el lead durante la llamada
  - persistir transcript, resumen y resultado al final

## Variables de entorno

En `Vercel`:

```env
INTERNAL_API_TOKEN=...
ELEVENLABS_AGENT_ID=...
ELEVENLABS_WEBHOOK_SECRET=...
ELEVENLABS_API_KEY=...
TELNYX_PHONE_NUMBER=+34983460825
BASE_URL=https://nesped-production.up.railway.app
NEXT_PUBLIC_APP_URL=https://nesped.com
```

En `Railway`:

```env
INTERNAL_API_TOKEN=...
ELEVENLABS_WEBHOOK_SECRET=...
TELNYX_PHONE_NUMBER=+34983460825
BASE_URL=https://nesped-production.up.railway.app
```

Recuerda tambien:

- `TELNYX_ACCOUNT_SID`
- `TELNYX_TEXML_APPLICATION_ID`

Siguen siendo utiles si quieres mantener la llamada demo saliente actual por TeXML.

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
- el payload final guarda la llamada en `calls`
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

## Configuracion en Telnyx

No uses TeXML para la llamada entrante si quieres el hibrido completo.

Sigue la guia oficial de SIP trunking de ElevenLabs para Telnyx:

- crea una `SIP Connection` en Telnyx
- tipo `FQDN`
- FQDN destino: `sip.rtc.elevenlabs.io`
- `Destination Number Format`: `+E.164`
- `SIP Transport Protocol`: `TCP`
- asigna el numero `+34983460825` a esa SIP connection

Guia oficial:

- `https://elevenlabs.io/docs/eleven-agents/phone-numbers/telephony/telnyx`

## Flujo recomendado

1. El numero se activa en Telnyx.
2. Conectas Telnyx a ElevenLabs por SIP.
3. El agente de ElevenLabs llama a `load_call_context`.
4. Si detecta oportunidad, llama a `upsert_call_lead`.
5. Al final, ElevenLabs manda `post_call_transcription`.
6. Nesped guarda la llamada y el portal la muestra en `Voice Center`.
