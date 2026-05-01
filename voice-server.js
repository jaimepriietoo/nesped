require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const crypto = require("crypto");
const Sentry = require("@sentry/node");
const { createClient } = require("@supabase/supabase-js");

const SECRET_FIELD_PATTERN =
  /authorization|cookie|set-cookie|token|secret|password|api[_-]?key|dsn|x-nesped-internal-token/i;

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getVoiceSentryDsn() {
  return (
    String(process.env.SENTRY_DSN || "").trim() ||
    String(process.env.NEXT_PUBLIC_SENTRY_DSN || "").trim()
  );
}

function isVoiceSentryEnabled() {
  return Boolean(getVoiceSentryDsn());
}

function getSentryEnvironment() {
  return (
    String(process.env.SENTRY_ENVIRONMENT || "").trim() ||
    String(process.env.RAILWAY_ENVIRONMENT || "").trim() ||
    process.env.NODE_ENV ||
    "development"
  );
}

function getSentryRelease() {
  return (
    String(process.env.SENTRY_RELEASE || "").trim() ||
    String(process.env.RAILWAY_GIT_COMMIT_SHA || "").trim() ||
    String(process.env.GIT_COMMIT_SHA || "").trim()
  );
}

function sanitizeObject(value, depth = 0) {
  if (depth > 4 || value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SECRET_FIELD_PATTERN.test(key)
        ? "[redacted]"
        : sanitizeObject(nested, depth + 1),
    ])
  );
}

function sanitizeError(error) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack:
      typeof error.stack === "string"
        ? error.stack.split("\n").slice(0, 6).join("\n")
        : "",
  };
}

function initVoiceSentry() {
  if (!isVoiceSentryEnabled()) {
    return false;
  }

  Sentry.init({
    dsn: getVoiceSentryDsn(),
    enabled: true,
    environment: getSentryEnvironment(),
    release: getSentryRelease() || undefined,
    sendDefaultPii: false,
    attachStacktrace: true,
    sampleRate: numberEnv("SENTRY_ERROR_SAMPLE_RATE", 1),
    tracesSampleRate: numberEnv(
      "SENTRY_TRACES_SAMPLE_RATE",
      process.env.NODE_ENV === "production" ? 0.15 : 1
    ),
    profilesSampleRate: numberEnv("SENTRY_PROFILES_SAMPLE_RATE", 0),
    beforeSend(event) {
      const nextEvent = { ...event };

      if (nextEvent.request?.headers) {
        nextEvent.request = {
          ...nextEvent.request,
          headers: sanitizeObject(nextEvent.request.headers),
        };
      }

      if (nextEvent.extra) {
        nextEvent.extra = sanitizeObject(nextEvent.extra);
      }

      if (nextEvent.contexts) {
        nextEvent.contexts = sanitizeObject(nextEvent.contexts);
      }

      if (nextEvent.user) {
        nextEvent.user = sanitizeObject(nextEvent.user);
        delete nextEvent.user.ip_address;
      }

      return nextEvent;
    },
    initialScope: {
      tags: {
        service: "voice-server",
      },
    },
  });

  return true;
}

function captureVoiceException(error, event, extra = {}, level = "error") {
  if (!isVoiceSentryEnabled()) {
    return null;
  }

  return Sentry.withScope((scope) => {
    scope.setTag("service", "voice-server");
    if (event) {
      scope.setTag("event", event);
    }
    scope.setLevel(level);
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        scope.setExtra(key, sanitizeObject(value));
      }
    });
    return Sentry.captureException(
      error instanceof Error ? error : new Error(String(error))
    );
  });
}

function captureVoiceMessage(message, event, extra = {}, level = "error") {
  if (!isVoiceSentryEnabled()) {
    return null;
  }

  return Sentry.withScope((scope) => {
    scope.setTag("service", "voice-server");
    if (event) {
      scope.setTag("event", event);
    }
    scope.setLevel(level);
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        scope.setExtra(key, sanitizeObject(value));
      }
    });
    return Sentry.captureMessage(String(message || event || "voice.message"));
  });
}

function reportVoiceError(error, event, extra = {}, level = "error") {
  captureVoiceException(error, event, extra, level);
  logEvent("error", event, {
    ...extra,
    error: sanitizeError(error),
  });
}

initVoiceSentry();

function logEvent(level, event, data = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: "voice-server",
    level,
    event,
    ...data,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

console.log("VOICE SERVER ENTERPRISE FINAL - 2026-04-07");
console.log("OPENAI_API_KEY presente:", !!process.env.OPENAI_API_KEY);
console.log("BASE_URL:", process.env.BASE_URL);
console.log("PORT:", process.env.PORT);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);

const accountSid =
  process.env.ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const authToken =
  process.env.AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const fallbackTwilioNumber =
  process.env.TWILIO_NUMERO || process.env.TWILIO_PHONE_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

const hasSupabase =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = hasSupabase
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

const pendingRecordings = new Map();
const PENDING_RECORDING_TTL_MS = 24 * 60 * 60 * 1000;
const RECORDING_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.RECORDING_RETENTION_DAYS || 30)
);
const TRANSCRIPT_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.TRANSCRIPT_RETENTION_DAYS || 90)
);

const DEMO_CLIENT_CONFIGS = {
  demo: {
    id: "demo",
    name: "NESPED Demo",
  },
  globetelecom: {
    id: "globetelecom",
    name: "Globetelecom",
  },
  clinica: {
    id: "clinica",
    name: "Clínica Dental",
  },
  inmobiliaria: {
    id: "inmobiliaria",
    name: "Inmobiliaria Pérez",
  },
};

if (!hasSupabase) {
  console.log("⚠️ Supabase desactivado");
}

if (!client) {
  logEvent("warn", "voice.twilio_missing_env", {
    hasAccountSid: Boolean(accountSid),
    hasAuthToken: Boolean(authToken),
  });
}

process.on("unhandledRejection", (reason) => {
  reportVoiceError(
    reason instanceof Error ? reason : new Error(String(reason)),
    "process.unhandled_rejection"
  );
});

process.on("uncaughtException", (error) => {
  reportVoiceError(error, "process.uncaught_exception", {}, "fatal");
});

app.get("/", (req, res) => {
  res.send("NESPED Voice Server activo");
});

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "voice-server",
    env: {
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasSupabase,
      hasTwilioClient: Boolean(client),
      hasSentryDsn: isVoiceSentryEnabled(),
      hasBaseUrl: Boolean(process.env.BASE_URL),
      hasTwilioNumber: Boolean(fallbackTwilioNumber),
      recordingRetentionDays: RECORDING_RETENTION_DAYS,
      transcriptRetentionDays: TRANSCRIPT_RETENTION_DAYS,
    },
    pendingRecordings: pendingRecordings.size,
    now: new Date().toISOString(),
  });
});

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getInternalApiToken() {
  return (
    process.env.INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function isAuthorizedInternalRequest(req) {
  const expected = getInternalApiToken();
  const provided =
    req.headers["x-nesped-internal-token"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!expected || !provided) {
    return false;
  }

  return safeEqual(provided, expected);
}

function getPublicBaseUrl() {
  return String(process.env.BASE_URL || "").replace(/\/+$/, "");
}

function getTwilioValidationUrl(req) {
  const baseUrl = getPublicBaseUrl();

  if (!baseUrl) {
    return "";
  }

  return `${baseUrl}${req.originalUrl || req.url || ""}`;
}

function isValidTwilioHttpRequest(req) {
  const validationUrl = getTwilioValidationUrl(req);

  if (!authToken || !validationUrl) {
    return false;
  }

  return twilio.validateExpressRequest(req, authToken, {
    url: validationUrl,
  });
}

function isValidTwilioWsRequest(req) {
  const baseUrl = getPublicBaseUrl();
  const signature = req.headers["x-twilio-signature"] || "";

  if (!authToken || !baseUrl || !signature) {
    return false;
  }

  return twilio.validateRequest(
    authToken,
    signature,
    `${baseUrl}${req.url || ""}`,
    {}
  );
}

function getRecordingMediaUrl(recordingUrl = "") {
  if (!recordingUrl) {
    return "";
  }

  return /\.(mp3|wav)$/i.test(recordingUrl)
    ? recordingUrl
    : `${recordingUrl}.mp3`;
}

function cleanupPendingRecordings() {
  const now = Date.now();

  for (const [callSid, entry] of pendingRecordings.entries()) {
    if (!entry?.updatedAt || now - entry.updatedAt > PENDING_RECORDING_TTL_MS) {
      pendingRecordings.delete(callSid);
    }
  }
}

function getFallbackPrompt() {
  return `
Eres un asistente telefónico humano, natural y profesional. No pareces una IA. Suenas como una persona real hablando por teléfono.

Hablas en español de forma cercana, relajada y natural. Usas frases cortas, tono humano y expresiones reales.

Tu objetivo es:
1. atender la llamada
2. entender qué necesita el usuario
3. recoger sus datos si hay interés
4. cerrar la conversación de forma natural y terminar

ESTILO:
- Hablas como una persona real
- Usas expresiones naturales como "vale", "perfecto", "genial", "entiendo", "claro", "sin problema"
- No hablas demasiado seguido
- No usas frases largas
- No explicas de más
- No suenas formal ni técnico
- No haces listas largas
- No das respuestas tipo chatbot

COMPORTAMIENTO:
- Saluda de forma breve y natural
- Haz solo una pregunta cada vez
- No interrumpas
- Si el usuario tiene interés, recoge los datos rápido y con naturalidad
- Si no sabes algo, dilo de forma natural y ofrece que el equipo contacte después

RUIDO:
- Ignora toses, carraspeos, respiraciones, golpes, ruidos de fondo y sonidos cortos
- No respondas a sonidos sueltos
- No cambies de tema por ruido
- Si no has entendido bien, pide repetirlo de forma natural
- Si no hay una frase clara del usuario, no respondas

RITMO:
- Espera a que la persona termine claramente
- No respondas a pausas cortas
- Si la frase queda a medias, espera
- No te precipites

CAPTURA DE LEAD:
Recoge, de forma natural:
- nombre
- teléfono
- necesidad

Opcional:
- ciudad
- preferencia
- urgencia

No pidas todo de golpe.

Cuando ya tengas como mínimo:
- nombre
- teléfono
- necesidad

usa la función guardar_lead.

CIERRE:
Después de guardar el lead o cerrar la consulta, di una frase breve y natural como:
- "Perfecto, ya lo tengo todo apuntado, te contactan en breve"
- "Genial, queda registrado y te dicen algo pronto"
- "Vale, todo listo, te contactan enseguida"

Después de eso:
- no hagas más preguntas
- no alargues la conversación
- no sigas hablando

DESPEDIDAS:
- si la persona se despide o deja claro que se tiene que ir, respóndele con una despedida breve, cálida y natural
- ejemplos: "adios", "hasta luego", "hablamos", "chao", "me tengo que ir", "nos vemos", "un saludo", "gracias, adios", "vale, hablamos luego"
- cuando detectes una despedida, no reabras la conversación, no hagas preguntas y termina por completo

LEGAL:
- la llamada ya ha sido avisada como grabada y transcrita antes de entrar contigo
- si la persona no quiere ser grabada o muestra reparos de privacidad, responde con empatía, ofrece contacto por otra vía y cierra sin insistir
`.trim();
}

function getDemoClientConfig(clientId = "") {
  return DEMO_CLIENT_CONFIGS[String(clientId || "").trim()] || null;
}

function injectClientNameIntoPrompt(clientName = "", prompt = "") {
  const safeName = String(clientName || "").trim();
  const basePrompt = String(prompt || getFallbackPrompt()).trim();

  if (!safeName) {
    return basePrompt;
  }

  return `
Actúas en nombre de ${safeName}.
Si el usuario pregunta quién llama o de parte de qué empresa hablas, responde con naturalidad que llamas de ${safeName}.
Mantén ese contexto durante toda la conversación.

${basePrompt}
  `.trim();
}

function getVoicePolicyUrl() {
  const explicit = String(process.env.VOICE_PRIVACY_URL || "").trim();
  if (explicit) return explicit;

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return appUrl ? `${appUrl}/legal/voice-compliance` : "";
}

function buildVoiceLegalNotice() {
  const baseNotice =
    process.env.VOICE_LEGAL_NOTICE ||
    "Aviso. Esta llamada puede ser atendida por un asistente de voz con IA y puede ser grabada y transcrita para calidad, seguridad, seguimiento comercial y mejora del servicio. Si prefieres no continuar en estas condiciones, indicalo y te ofreceremos una alternativa de contacto.";
  const policyUrl = getVoicePolicyUrl();
  return policyUrl ? `${baseNotice} Más información en ${policyUrl}.` : baseNotice;
}

function normalizeTranscriptText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectFarewellIntent(value = "") {
  const text = normalizeTranscriptText(value);
  if (!text) return false;

  const phrases = [
    "adios",
    "hasta luego",
    "hasta pronto",
    "hablamos",
    "vale hablamos luego",
    "perfecto hasta luego",
    "gracias adios",
    "chao",
    "ciao",
    "nos vemos",
    "un saludo",
    "me tengo que ir",
    "me voy",
    "te dejo",
    "te tengo que dejar",
    "luego hablamos",
    "hablamos luego",
    "hasta otra",
    "hasta mas tarde",
    "gracias hasta luego",
  ];

  return phrases.some((phrase) => text.includes(phrase));
}

async function getClientConfig(clientId) {
  const fallbackClient = getDemoClientConfig(clientId);

  if (!supabase) {
    return {
      id: fallbackClient?.id || clientId || "demo",
      name: fallbackClient?.name || "NESPED Demo",
      prompt: injectClientNameIntoPrompt(
        fallbackClient?.name || "NESPED Demo",
        getFallbackPrompt()
      ),
      webhook: "",
      twilioNumber: fallbackTwilioNumber,
    };
  }

  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (error || !data) {
      reportVoiceError(
        new Error(error?.message || "sin data"),
        "voice.client_config.load_failed",
        { clientId }
      );

      return {
        id: fallbackClient?.id || clientId || "demo",
        name: fallbackClient?.name || "NESPED Demo",
        prompt: injectClientNameIntoPrompt(
          fallbackClient?.name || "NESPED Demo",
          getFallbackPrompt()
        ),
        webhook: "",
        twilioNumber: fallbackTwilioNumber,
      };
    }

    return {
      id: data.id,
      name: data.brand_name || data.name || fallbackClient?.name || "Cliente",
      prompt: injectClientNameIntoPrompt(
        data.brand_name || data.name || fallbackClient?.name || "Cliente",
        data.prompt || getFallbackPrompt()
      ),
      webhook: data.webhook || "",
      twilioNumber: data.twilio_number || fallbackTwilioNumber,
    };
  } catch (err) {
    reportVoiceError(err, "voice.client_config.exception", { clientId });

    return {
      id: fallbackClient?.id || clientId || "demo",
      name: fallbackClient?.name || "NESPED Demo",
      prompt: injectClientNameIntoPrompt(
        fallbackClient?.name || "NESPED Demo",
        getFallbackPrompt()
      ),
      webhook: "",
      twilioNumber: fallbackTwilioNumber,
    };
  }
}

app.get("/call", async (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).send("No autorizado");
  }

  try {
    if (!client) {
      return res.status(500).send("Twilio no configurado");
    }

    const clientId = req.query.client_id || "demo";
    const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");

    const config = await getClientConfig(clientId);
    if (!config) {
      return res.status(404).send("Cliente no encontrado");
    }

    const call = await client.calls.create({
      to: process.env.TU_NUMERO,
      from: config.twilioNumber || fallbackTwilioNumber,
      url: `${cleanBaseUrl}/voice?client_id=${clientId}`,
      method: "POST",
      record: true,
      recordingStatusCallback: `${cleanBaseUrl}/recording-status?client_id=${clientId}`,
      recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: "completed",
    });

    console.log("📞 Llamada iniciada:", call.sid, "cliente:", clientId);
    res.send("Llamada iniciada: " + call.sid);
  } catch (error) {
    reportVoiceError(error, "voice.call.start_failed", {
      clientId: req.query.client_id || "demo",
    });
    res.status(500).send("Error: " + error.message);
  }
});

app.post("/recording-status", async (req, res) => {
  if (!isValidTwilioHttpRequest(req)) {
    console.warn("🚫 recording-status rechazado por firma inválida");
    return res.status(403).send("forbidden");
  }

  try {
    cleanupPendingRecordings();

    const recordingUrl = req.body?.RecordingUrl || "";
    const callSid = req.body?.CallSid || "";
    const recordingStatus = req.body?.RecordingStatus || "";
    const clientId = req.query.client_id || "demo";
    const normalizedRecordingUrl = getRecordingMediaUrl(recordingUrl);

    console.log("🎙️ Recording callback:", {
      recordingUrl: normalizedRecordingUrl,
      callSid,
      recordingStatus,
    });

    if (callSid && normalizedRecordingUrl) {
      pendingRecordings.set(callSid, {
        recordingUrl: normalizedRecordingUrl,
        updatedAt: Date.now(),
      });
    }

    if (supabase && callSid && normalizedRecordingUrl) {
      const { data, error } = await supabase
        .from("calls")
        .update({
          recording_url: normalizedRecordingUrl,
        })
        .eq("call_sid", callSid)
        .eq("client_id", clientId)
        .select("call_sid");

      if (error) {
        reportVoiceError(error, "voice.recording_status.persist_failed", {
          callSid,
          clientId,
        });
      } else if (Array.isArray(data) && data.length > 0) {
        console.log("✅ recording_url guardada en calls");
        pendingRecordings.delete(callSid);
      }
    }

    res.status(200).send("ok");
  } catch (error) {
    reportVoiceError(error, "voice.recording_status.failed", {
      callSid: req.body?.CallSid || "",
      clientId: req.query.client_id || "demo",
    });
    res.status(500).send("error");
  }
});

function buildVoiceTwiml(clientId) {
  const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");
  const streamUrl = `${cleanBaseUrl.replace(
    "https://",
    "wss://"
  )}/media-stream?client_id=${clientId}`;
  const legalNotice = buildVoiceLegalNotice()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  console.log("🌐 STREAM URL:", streamUrl);

  return `
<Response>
  <Say language="es-ES" voice="alice">${legalNotice}</Say>
  <Pause length="1" />
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>
  `.trim();
}

app.get("/voice", (req, res) => {
  if (!isValidTwilioHttpRequest(req)) {
    console.warn("🚫 GET /voice rechazado por firma inválida");
    return res.status(403).send("forbidden");
  }

  const clientId = req.query.client_id || "demo";
  console.log("GET /voice");
  console.log("🏢 Cliente detectado en /voice:", clientId);

  const xml = buildVoiceTwiml(clientId);
  res.type("text/xml");
  res.send(xml);
});

app.post("/voice", (req, res) => {
  if (!isValidTwilioHttpRequest(req)) {
    console.warn("🚫 POST /voice rechazado por firma inválida");
    return res.status(403).send("forbidden");
  }

  const clientId = req.query.client_id || "demo";
  console.log("POST /voice");
  console.log("🏢 Cliente detectado en /voice:", clientId);

  const xml = buildVoiceTwiml(clientId);
  res.type("text/xml");
  res.send(xml);
});

const wss = new WebSocket.Server({ server, path: "/media-stream" });
console.log("✅ WebSocket /media-stream listo");

wss.on("connection", async (twilioWs, req) => {
  if (!isValidTwilioWsRequest(req)) {
    console.warn("🚫 WebSocket /media-stream rechazado por firma inválida");
    twilioWs.close();
    return;
  }

  const url = new URL(req.url, "https://dummy");
  const clientId = url.searchParams.get("client_id") || "demo";

  console.log("🟢 Twilio conectado a /media-stream");
  console.log("🔥 Cliente WS:", clientId);

  const config = await getClientConfig(clientId);

  if (!config) {
    reportVoiceError(
      new Error("No hay configuración para el cliente"),
      "voice.websocket.missing_client_config",
      { clientId },
      "warning"
    );
    twilioWs.close();
    return;
  }

  let streamSid = null;
  let callSid = null;
  let greeted = false;
  let leadCaptured = false;
  let callStartedAt = Date.now();
  let fromNumber = "";
  let toNumber = "";
  let transcriptParts = [];
  let callSummary = "Llamada atendida";
  let closingRequested = false;
  let callSaved = false;

  let totalMediaChunks = 0;
  let speechStartChunk = null;
  let lastUtteranceChunks = 0;
  let noiseResponseGuard = false;
  let pendingHangup = null;

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  console.log("🔄 Intentando conectar con OpenAI realtime...");

  function addTranscriptLine(line) {
    if (!line) return;
    transcriptParts.push(line);
    if (transcriptParts.length > 400) {
      transcriptParts = transcriptParts.slice(-400);
    }
  }

  async function saveCall(status = "completed") {
    if (callSaved) return;
    callSaved = true;

    if (!supabase) {
      console.log("⚠️ saveCall omitido porque Supabase está desactivado");
      return;
    }

    try {
      cleanupPendingRecordings();

      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - callStartedAt) / 1000)
      );

      const transcript = transcriptParts.join("\n").trim();
      const pendingRecording = callSid ? pendingRecordings.get(callSid) : null;

      await supabase.from("calls").insert({
        client_id: clientId,
        call_sid: callSid || null,
        from_number: fromNumber || "",
        to_number: toNumber || "",
        status,
        summary: callSummary,
        transcript,
        lead_captured: leadCaptured,
        duration_seconds: durationSeconds,
        ai_spoke: true,
        call_outcome: leadCaptured
          ? "lead_captured"
          : "completed_without_lead",
        detected_intent: leadCaptured ? "captacion" : "consulta",
        summary_long: transcript
          ? `Resumen automático: ${callSummary}. Transcripción disponible para análisis.`
          : callSummary,
        recording_url: pendingRecording?.recordingUrl || null,
      });

      if (callSid && pendingRecording) {
        pendingRecordings.delete(callSid);
      }

      console.log("📞 Llamada guardada en Supabase");
    } catch (err) {
      reportVoiceError(err, "voice.call.persist_failed", {
        callSid,
        clientId,
        status,
      });
    }
  }

  async function saveLeadToSupabase(args) {
    if (!supabase) {
      console.log("⚠️ saveLead omitido porque Supabase está desactivado");
      return null;
    }

    try {
      const nombre = args.nombre || "";
      const telefono = args.telefono || "";
      const ciudad = args.ciudad || "";
      const necesidad = args.necesidad || "";
      const preferencia = args.preferencia || "";

      let score = 0;

      try {
        const { data: scoreValue, error: scoreError } = await supabase.rpc(
          "calculate_lead_score",
          {
            p_nombre: nombre,
            p_telefono: telefono,
            p_necesidad: necesidad,
            p_ciudad: ciudad || null,
          }
        );

        if (!scoreError && typeof scoreValue === "number") {
          score = scoreValue;
        }
      } catch (err) {
        reportVoiceError(err, "voice.lead.score_failed", { clientId }, "warning");
      }

      const interes =
        score >= 80 ? "alto" : score >= 50 ? "medio" : "bajo";

      const tags = [
        "llamada_ia",
        necesidad ? "necesidad_detectada" : null,
        ciudad ? `ciudad:${ciudad}` : null,
        preferencia ? `preferencia:${preferencia}` : null,
        interes ? `interes:${interes}` : null,
      ].filter(Boolean);

      const resumen = [
        nombre ? `${nombre}` : "Lead sin nombre",
        necesidad ? `necesita ${necesidad}` : null,
        ciudad ? `en ${ciudad}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const { data: insertedLead, error } = await supabase
        .from("leads")
        .insert({
          client_id: clientId,
          nombre,
          telefono,
          ciudad,
          necesidad,
          origen: `llamada_${clientId}`,
          fuente: "llamada_ia",
          score,
          status: "new",
          tags,
          ultima_accion: "Lead capturado por la IA en llamada",
          proxima_accion: "Contactar al lead lo antes posible",
          interes,
          resumen,
          notes: preferencia || null,
        })
        
        .select()
        .single();

        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/next-best-action/save`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-nesped-internal-token":
      process.env.INTERNAL_API_TOKEN ||
      process.env.CRON_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "",
  },
  body: JSON.stringify({
    leadId: insertedLead.id,
    clientId: insertedLead.client_id,
    brandName: "Nesped",
  }),
});

      if (error) {
        reportVoiceError(error, "voice.lead.persist_failed", {
          clientId,
          telefono,
        });
        return null;
      }

      console.log("✅ Lead guardado en Supabase");

      try {
        const { error: eventError } = await supabase.from("lead_events").insert({
          lead_id: insertedLead.id,
          client_id: clientId,
          type: "lead_created",
          title: "Lead creado automáticamente",
          description: `Lead capturado por llamada. Nombre: ${nombre || "-"} · Teléfono: ${telefono || "-"} · Necesidad: ${necesidad || "-"}`,
          meta: {
            origen: `llamada_${clientId}`,
            score,
            interes,
            preferencia,
          },
        });

        if (eventError) {
          reportVoiceError(eventError, "voice.lead_event.persist_failed", {
            clientId,
            leadId: insertedLead.id,
          });
        } else {
          console.log("✅ Evento de lead guardado");
        }
      } catch (err) {
        reportVoiceError(err, "voice.lead_event.exception", {
          clientId,
          leadId: insertedLead.id,
        });
      }

      return insertedLead;
    } catch (err) {
      reportVoiceError(err, "voice.lead.exception", { clientId });
      return null;
    }
  }

  function requestClosingResponse(text) {
    if (closingRequested || openaiWs.readyState !== WebSocket.OPEN) return;
    closingRequested = true;

    openaiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: text,
        },
      })
    );
  }

  async function hangupCall() {
    if (!callSid || !client) return;

    try {
      await client.calls(callSid).update({
        status: "completed",
      });
      console.log("📴 Twilio call completada:", callSid);
    } catch (err) {
      reportVoiceError(err, "voice.call.hangup_failed", { callSid }, "warning");
    }
  }

  function endCallSoon() {
    console.log("📴 Cerrando llamada...");

    hangupCall();

    try {
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.close();
      }
    } catch (err) {
      reportVoiceError(err, "voice.twilio_ws.close_failed", { callSid }, "warning");
    }

    try {
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    } catch (err) {
      reportVoiceError(err, "voice.openai_ws.close_failed", { callSid }, "warning");
    }
  }

  openaiWs.on("open", () => {
    console.log("🤖 OpenAI conectado para:", config.name);

    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          instructions: (config.prompt || getFallbackPrompt()).trim(),
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true,
            interrupt_response: true,
          },
          tools: [
            {
              type: "function",
              name: "guardar_lead",
              description:
                "Guardar un lead cuando ya tengas nombre, teléfono y necesidad del usuario.",
              parameters: {
                type: "object",
                properties: {
                  nombre: { type: "string" },
                  telefono: { type: "string" },
                  necesidad: { type: "string" },
                  ciudad: { type: "string" },
                  preferencia: { type: "string" },
                },
                required: ["nombre", "telefono", "necesidad"],
              },
            },
          ],
          tool_choice: "auto",
        },
      })
    );

    console.log("⚙️ session.update enviado");
  });

  twilioWs.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.event !== "media") {
        console.log("Twilio event:", data.event, JSON.stringify(data));
      }

      if (data.event === "start") {
        streamSid = data.start?.streamSid || data.streamSid || null;
        callSid = data.start?.callSid || null;
        fromNumber = data.start?.customParameters?.from || "";
        toNumber = data.start?.customParameters?.to || "";
        addTranscriptLine("[SYSTEM] Inicio de llamada");
        console.log("📞 Stream iniciado:", streamSid);
        console.log("📞 Call SID:", callSid);
      }

      if (data.event === "media") {
        totalMediaChunks += 1;

        if (!streamSid && data.streamSid) {
          streamSid = data.streamSid;
          console.log("📌 streamSid recuperado desde media:", streamSid);
        }

        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: data.media.payload,
            })
          );
        }
      }

      if (data.event === "stop") {
        console.log("🔴 Twilio stop recibido");
        await saveCall(leadCaptured ? "lead_captured" : "completed");

        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      }
    } catch (err) {
      reportVoiceError(err, "voice.twilio_message.failed", {
        callSid,
        streamSid,
      });
    }
  });

  openaiWs.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      console.log("OpenAI event:", event.type);

      if (event.type === "error") {
        captureVoiceMessage(
          "OpenAI websocket error event",
          "voice.openai_event.error",
          { event }
        );
        console.error("❌ OPENAI ERROR COMPLETO:", JSON.stringify(event, null, 2));
        return;
      }

      if (event.type === "session.updated") {
        console.log("✅ OpenAI listo");

        if (!greeted) {
          greeted = true;
          openaiWs.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Saluda de forma muy natural, breve y humana en español, como una persona real por teléfono, y pregunta en qué puedes ayudar.",
              },
            })
          );
          console.log("👋 response.create enviado");
        }
      }

      if (event.type === "input_audio_buffer.speech_started") {
        speechStartChunk = totalMediaChunks;
        noiseResponseGuard = false;
        console.log("🟢 speech_started");

        if (pendingHangup) {
          clearTimeout(pendingHangup);
          pendingHangup = null;
        }
      }

      if (event.type === "input_audio_buffer.speech_stopped") {
        if (speechStartChunk !== null) {
          lastUtteranceChunks = totalMediaChunks - speechStartChunk;
        } else {
          lastUtteranceChunks = 0;
        }

        noiseResponseGuard = lastUtteranceChunks < 45;

        console.log(
          `🟡 speech_stopped | chunks=${lastUtteranceChunks} | noiseGuard=${noiseResponseGuard}`
        );
      }

      if (event.type === "response.created" && noiseResponseGuard) {
        console.log("🚫 Cancelando respuesta por input demasiado corto/ruido");
        openaiWs.send(
          JSON.stringify({
            type: "response.cancel",
          })
        );
        return;
      }

      if (
        event.type === "response.audio.delta" ||
        event.type === "response.output_audio.delta"
      ) {
        if (noiseResponseGuard) {
          console.log("🚫 Audio descartado por noiseGuard");
          return;
        }

        if (!event.delta) {
          console.log("⚠️ Audio delta sin payload");
        } else if (!streamSid) {
          console.log("⚠️ Audio delta recibido pero no hay streamSid todavía");
        } else {
          twilioWs.send(
            JSON.stringify({
              event: "media",
              streamSid,
              media: {
                payload: event.delta,
              },
            })
          );
          console.log("🔊 Audio enviado a Twilio");
        }
      }

      if (
        event.type === "response.audio.done" ||
        event.type === "response.output_audio.done"
      ) {
        console.log("✅ audio done recibido");
      }

      if (event.type === "response.done") {
        console.log("✅ response.done recibido");

        if (closingRequested) {
          pendingHangup = setTimeout(() => {
            endCallSoon();
          }, 1400);
        }
      }

      if (event.type === "response.cancelled") {
        console.log("⛔ response.cancelled recibido");
      }

      if (event.type === "response.text.delta" && event.delta) {
        addTranscriptLine(`[AI] ${event.delta}`);
      }

      if (event.type === "response.audio_transcript.delta" && event.delta) {
        addTranscriptLine(`[AI] ${event.delta}`);
      }

      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        event.transcript
      ) {
        addTranscriptLine(`[USER] ${event.transcript}`);

        if (detectFarewellIntent(event.transcript) && !closingRequested) {
          callSummary = "La persona se despidio y la llamada se cerro de forma natural.";

          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
              JSON.stringify({
                type: "response.cancel",
              })
            );
          }

          requestClosingResponse(
            "El usuario se esta despidiendo. Responde con una sola frase breve, humana y calida para despedirte en espanol, sin hacer preguntas ni retomar la conversacion. Despues termina completamente la llamada."
          );
        }
      }

      if (
        event.type === "response.output_item.done" &&
        event.item?.type === "function_call"
      ) {
        const args = JSON.parse(event.item.arguments || "{}");
        console.log("💾 Guardando lead:", args);

        leadCaptured = true;

        const insertedLead = await saveLeadToSupabase(args);

        const leadName = args.nombre || "sin nombre";
        const leadNeed = args.necesidad || "sin necesidad";
        const leadScore = insertedLead?.score ?? 0;
        const leadInterest = insertedLead?.interes || "medio";

        callSummary = `Lead capturado: ${leadName} · ${leadNeed} · score ${leadScore} · interés ${leadInterest}`;

        if (!config.webhook) {
          console.log("⚠️ Webhook no configurado, se omite guardar lead externo");

          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.item.call_id,
                output: JSON.stringify({ ok: true }),
              },
            })
          );

          requestClosingResponse(
            "Confirma de forma muy natural, breve y humana que ya está apuntado y que le contactarán en breve. Después termina completamente la conversación."
          );
          return;
        }

        try {
          const webhookRes = await fetch(config.webhook, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fecha: new Date().toISOString(),
              nombre: args.nombre || "",
              telefono: args.telefono || "",
              necesidad: args.necesidad || "",
              ciudad: args.ciudad || "",
              preferencia: args.preferencia || "",
              origen: `llamada_${clientId}`,
              cliente: clientId,
              score: leadScore,
              interes: leadInterest,
            }),
          });

          const webhookText = await webhookRes.text();
          console.log("📨 webhook status:", webhookRes.status);
          console.log("📨 webhook response:", webhookText);

          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.item.call_id,
                output: JSON.stringify({ ok: true }),
              },
            })
          );

          requestClosingResponse(
            "Confirma de forma muy natural, breve y humana que ya está registrado y que el equipo contactará pronto. Después termina completamente la conversación."
          );
        } catch (err) {
          reportVoiceError(err, "voice.webhook.delivery_failed", {
            clientId,
            webhook: config.webhook,
          });

          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.item.call_id,
                output: JSON.stringify({ ok: false }),
              },
            })
          );

          requestClosingResponse(
            "Di de forma natural que ya está anotado y que lo revisarán enseguida. Después termina completamente la conversación."
          );
        }
      }
    } catch (err) {
      reportVoiceError(err, "voice.openai_message.failed", {
        callSid,
        streamSid,
      });
    }
  });

  twilioWs.on("close", async () => {
    console.log("🔌 Twilio desconectado");
    await saveCall(leadCaptured ? "lead_captured" : "completed");

    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", async (err) => {
    reportVoiceError(err, "voice.twilio_ws.error", { callSid, streamSid });
    await saveCall("failed");
  });

  openaiWs.on("close", (code, reason) => {
    console.log("🔌 OpenAI desconectado");
    console.log("OpenAI close code:", code);
    console.log("OpenAI close reason:", reason?.toString());
  });

  openaiWs.on("error", (err) => {
    reportVoiceError(err, "voice.openai_ws.error", { callSid, streamSid });
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 NESPED Voice Server en puerto ${PORT}`);
});
