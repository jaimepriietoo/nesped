require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
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
const telnyxWebhookSecret = String(
  process.env.TELNYX_WEBHOOK_SECRET || ""
).trim();
const telnyxApiKey = String(process.env.TELNYX_API_KEY || "").trim();
const telnyxAccountSid = String(process.env.TELNYX_ACCOUNT_SID || "").trim();
const telnyxApplicationId = String(
  process.env.TELNYX_TEXML_APPLICATION_ID ||
    process.env.TELNYX_APPLICATION_SID ||
    ""
).trim();
const telnyxPhoneNumber = String(process.env.TELNYX_PHONE_NUMBER || "").trim();
const defaultVoiceNumber = telnyxPhoneNumber;

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

if (!hasTelnyxOutboundConfig()) {
  logEvent("warn", "voice.telnyx_missing_env", {
    hasApiKey: Boolean(telnyxApiKey),
    hasAccountSid: Boolean(telnyxAccountSid),
    hasApplicationId: Boolean(telnyxApplicationId),
    hasPhoneNumber: Boolean(telnyxPhoneNumber),
  });
}

function hasTelnyxOutboundConfig() {
  return Boolean(
    telnyxApiKey && telnyxAccountSid && telnyxApplicationId && telnyxPhoneNumber
  );
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

/* =========================================================================
   Comprobación real del enlace de voz.

   Antes /healthz sólo miraba que existiera la variable OPENAI_API_KEY. Con
   eso decía "todo bien" mientras la voz llevaba semanas caída, porque la API
   Beta que se usaba había dejado de existir: la clave estaba, pero ninguna
   llamada conectaba. Comprobar que una variable no está vacía no es
   comprobar nada.

   Esto abre de verdad una sesión contra OpenAI con la misma configuración
   que usan las llamadas. Se guarda el resultado unos minutos para no
   castigar la API en cada sondeo de Railway.
   ========================================================================= */

const CACHE_SONDA_MS = 5 * 60 * 1000;
let sondaVoz = { ok: null, detalle: "sin comprobar", enMs: null, cuando: 0 };
let sondaEnCurso = null;

function comprobarEnlaceVoz() {
  if (Date.now() - sondaVoz.cuando < CACHE_SONDA_MS) return Promise.resolve(sondaVoz);
  if (sondaEnCurso) return sondaEnCurso;

  sondaEnCurso = new Promise((listo) => {
    if (!process.env.OPENAI_API_KEY) {
      return listo({ ok: false, detalle: "falta OPENAI_API_KEY", enMs: null, cuando: Date.now() });
    }

    const t0 = Date.now();
    let resuelto = false;
    const terminar = (r) => {
      if (resuelto) return;
      resuelto = true;
      sondaVoz = { ...r, cuando: Date.now() };
      try { ws.close(); } catch { /* ya cerrado */ }
      listo(sondaVoz);
    };

    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODELO_VOZ)}`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    const corte = setTimeout(
      () => terminar({ ok: false, detalle: "sin respuesta en 8 s", enMs: null }),
      8000
    );

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model: MODELO_VOZ,
          output_modalities: ["audio"],
          audio: { output: { voice: VOZ, format: { type: "audio/pcmu" } } },
        },
      }));
    });

    ws.on("message", (raw) => {
      let e;
      try { e = JSON.parse(raw.toString()); } catch { return; }
      if (e.type === "session.updated") {
        clearTimeout(corte);
        terminar({ ok: true, detalle: `${MODELO_VOZ} · voz ${VOZ}`, enMs: Date.now() - t0 });
      }
      if (e.type === "error") {
        clearTimeout(corte);
        terminar({ ok: false, detalle: String(e.error?.message || "error").slice(0, 160), enMs: null });
      }
    });

    ws.on("error", (err) => {
      clearTimeout(corte);
      terminar({ ok: false, detalle: String(err?.message || err).slice(0, 160), enMs: null });
    });
  }).finally(() => { sondaEnCurso = null; });

  return sondaEnCurso;
}

app.get("/healthz", async (req, res) => {
  // `?rapido=1` para el sondeo de Railway, que no debe abrir sesiones.
  const sonda = req.query?.rapido
    ? sondaVoz
    : await comprobarEnlaceVoz().catch(() => sondaVoz);

  res.json({
    ok: true,
    service: "voice-server",

    /* Lo que de verdad importa: si una llamada podría atenderse ahora. */
    voz: {
      conecta: sonda.ok,
      detalle: sonda.detalle,
      handshakeMs: sonda.enMs,
      comprobadoHace: sonda.cuando ? `${Math.round((Date.now() - sonda.cuando) / 1000)} s` : null,
      modelo: MODELO_VOZ,
      voz: VOZ,
    },

    env: {
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasSupabase,
      hasTelnyxVoiceConfig: hasTelnyxOutboundConfig(),
      hasTelnyxApiKey: Boolean(telnyxApiKey),
      hasTelnyxWebhookSecret: Boolean(telnyxWebhookSecret),
      hasSentryDsn: isVoiceSentryEnabled(),
      hasBaseUrl: Boolean(process.env.BASE_URL),
      hasVoiceNumber: Boolean(defaultVoiceNumber),
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
    process.env.NESPED_SESSION_SECRET ||
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

// Misma lógica que lib/server/phone.js. Se duplica a propósito: este
// servidor corre en Railway como proceso Express suelto y no resuelve los
// alias "@/..." de Next. Si cambias una, cambia la otra.
function normalizePhone(value = "") {
  const bruto = String(value ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/^tel:/i, "")
    .trim();

  if (!bruto) return "";

  const tienePlus = bruto.startsWith("+");
  let digitos = bruto.replace(/\D/g, "");
  if (!digitos) return "";

  if (tienePlus) return `+${digitos}`;
  if (digitos.startsWith("00")) return `+${digitos.slice(2)}`;
  if (digitos.length === 9) return `+34${digitos}`;
  return `+${digitos}`;
}

function isValidTelnyxHttpRequest(req) {
  if (!telnyxWebhookSecret) {
    return true;
  }

  const provided =
    String(req.query?.secret || "").trim() ||
    String(req.body?.secret || "").trim() ||
    String(req.headers["x-nesped-provider-secret"] || "").trim();

  return safeEqual(provided, telnyxWebhookSecret);
}

function base64UrlEncode(value) {
  return Buffer.from(String(value || "")).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signVoicePayload(payload) {
  return crypto
    .createHmac("sha256", getInternalApiToken() || "nesped-voice-stream")
    .update(payload)
    .digest("base64url");
}

function createVoiceStreamToken(clientId = "") {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 5 * 60 * 1000;
  const body = base64UrlEncode(
    JSON.stringify({
      clientId: String(clientId || "demo"),
      issuedAt,
      expiresAt,
    })
  );

  return `${body}.${signVoicePayload(body)}`;
}

function readVoiceStreamToken(token = "") {
  if (!token || !String(token).includes(".")) return null;

  const [body, signature] = String(token).split(".");
  const expected = signVoicePayload(body);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    const now = Date.now();
    if (!payload?.clientId || !payload?.expiresAt || payload.expiresAt <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
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

/* =========================================================================
   Modelo y voz.

   Comprobado contra la API antes de fijarlo: gpt-realtime-2.1 existe y
   acepta esta configuración. Las voces "marin" y "cedar" son las nuevas de
   la versión GA y suenan bastante más naturales que "verse", que es la que
   había. Se dejan configurables para poder cambiarlas sin desplegar.
   ========================================================================= */

const MODELO_VOZ = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
const VOZ = process.env.OPENAI_VOICE || "marin";

/**
 * Instrucciones del agente.
 *
 * Escritas para voz, no para chat. La diferencia importa: por escrito una
 * respuesta larga se hojea, y por teléfono se sufre. Lo que delata a una
 * máquina no es el timbre —eso ya está resuelto— sino el comportamiento:
 * frases demasiado completas, cero titubeos, contestar sin acusar recibo,
 * y esa manía de rematar con "¿hay algo más en lo que pueda ayudarte?".
 *
 * Por eso las reglas son de conducta concreta y con ejemplos, en vez de
 * adjetivos como "sé natural", que un modelo no sabe traducir a nada.
 */
function getFallbackPrompt() {
  return `
Eres quien coge el teléfono en esta empresa. Una persona del equipo, no un
contestador ni un asistente virtual. Nunca digas que eres una IA, un bot ni
un asistente automático. Si te lo preguntan directamente, di que eres del
equipo y sigue con lo que estabais hablando.

IDIOMA
Castellano de España. Nada de "ahorita", "platicar", "carro", "celular",
"¿me regalas tu nombre?" ni voseo. Aquí se dice móvil, coche, vale, venga,
en un momento.

CÓMO SUENA UNA PERSONA POR TELÉFONO
Esto es lo que más importa. Una persona real:
- Habla corto. Una o dos frases y calla. Nunca sueltas un párrafo.
- Acusa recibo antes de contestar: "ajá", "vale", "sí, sí", "entiendo",
  "mmm", "claro". Es lo que hace que quien llama sepa que le escuchas.
- Empieza a veces por la mitad: "Sí, mira, eso lo llevamos", "Pues depende
  un poco de…", "A ver, te cuento".
- Duda de vez en cuando cuando piensa: "espera que mire", "a ver…",
  "pues…". No en cada frase, que suena a tic.
- Se repite y se corrige, como todo el mundo: "eso son… bueno, depende del
  tamaño".
- No repite la pregunta antes de responder. Si te preguntan el precio, no
  digas "me preguntas por el precio". Contesta.
- No enumera. Nada de "primero", "segundo", "por último". Si hay tres
  cosas, se dicen seguidas y ya.

LO QUE TE DELATARÍA, NO LO HAGAS NUNCA
- "¿En qué más puedo ayudarte?" ni "¿Hay algo más?"
- "Como asistente/como IA…"
- "Excelente pregunta", "Por supuesto", "Estaré encantado de…"
- Repetir el nombre de la persona en cada frase.
- Decir listas con guiones o números.
- Contestar tres cosas cuando te han preguntado una.
- Frases perfectas, largas y sin una sola arruga.

NÚMEROS Y DATOS
- Los teléfonos se repiten en grupos, como se hace: "seis cero dos… dos
  nueve siete… siete siete cero", no dígito a dígito ni de corrido.
- Los precios en euros, sin decimales si son redondos: "mil doscientos".
- Las horas como se dicen: "a las cuatro y media", no "16:30".
- Antes de dar por bueno un teléfono o un email, repítelo una vez para
  confirmar. Es lo que hace cualquiera y evita apuntar mal.

QUÉ TIENES QUE CONSEGUIR
Enterarte de qué necesita quien llama y quedarte con cómo localizarle.
Nada más. No vendes en la llamada, no cierras precio, no prometes plazos.

Averigua, sin soltarlo como un cuestionario y de uno en uno:
- qué necesita
- su nombre
- un teléfono de contacto
Y si sale de forma natural: dónde está, cuándo le viene bien, si tiene
prisa, si está pidiendo más presupuestos.

Cuando tengas nombre, teléfono y necesidad, llama a guardar_lead. No
anuncies que lo estás guardando; hazlo mientras sigues la conversación.

SI NO SABES ALGO
Dilo sin rodeos y ofrece que te llamen: "pues eso concreto no te lo sé
decir yo, pero te lo miran y te llaman". No te inventes precios, plazos,
disponibilidad ni condiciones. Jamás.

RUIDO Y CORTES
- Si oyes un golpe, una tos o ruido de fondo, no digas nada. Espera.
- Si la frase se ha cortado a la mitad, espera un momento antes de hablar.
- Si de verdad no has entendido, pídelo con naturalidad: "perdona, que no
  te he cogido bien, ¿me lo repites?".
- Si te interrumpen, cállate al momento y escucha. No termines tu frase.

CERRAR
Cuando ya tienes lo que necesitas, cierra y calla. Algo corto:
"Vale, pues ya lo tengo apuntado, te llaman en un rato" o
"Perfecto, queda anotado y te dicen algo hoy mismo".
Después no preguntes más, no resumas y no alargues.

Si la otra persona se despide —adiós, hasta luego, me tengo que ir, venga,
un saludo—, despídete corto y termina. No reabras la conversación.

GRABACIÓN
El aviso de grabación ya se ha dado antes de pasarte la llamada. Si alguien
muestra reparos, dale la razón, ofrécele otra vía de contacto y no insistas.
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

/**
 * Aviso previo a la grabación.
 *
 * Se ha acortado a la mitad a propósito. Lo lee un sintetizador antes de que
 * entre la voz buena, y cuanto más dura, más se nota el contraste y más
 * parece una centralita automática justo en el peor momento: el primero.
 * Sigue cubriendo lo que tiene que cubrir —que hay IA, que se graba y que se
 * puede pedir otra vía— pero en una frase en vez de en tres.
 */
function buildVoiceLegalNotice() {
  return (
    process.env.VOICE_LEGAL_NOTICE ||
    "Te atiende un asistente con inteligencia artificial y la llamada se graba para calidad y seguimiento. Si prefieres otra vía, dímelo."
  );
}

/**
 * Voz del aviso.
 *
 * Estaba en "Polly.Conchita-Neural", que no existe: en Amazon Polly, Conchita
 * es voz estándar y no tiene versión neural. La neural de español de España
 * es Lucía. Con un identificador inválido, la operadora no lee el aviso como
 * se espera, y era lo primero que oía todo el que llamaba.
 */
function getVoiceAvisoTts() {
  return process.env.VOICE_NOTICE_TTS || "Polly.Lucia-Neural";
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

/**
 * Configuración con la que el agente atiende una llamada.
 *
 * Devuelve `null` cuando NO se puede determinar de quién es la llamada. Antes
 * improvisaba una identidad genérica ("NESPED Demo"), y con varios clientes
 * eso significa que quien marcó el número de una clínica podía oír la marca
 * y el guion de otra empresa. Los dos consumidores ya tratan el nulo: uno
 * responde 404 y el otro cierra el WebSocket, así que la llamada se rechaza
 * en vez de suplantar.
 *
 * Los clientes de DEMO_CLIENT_CONFIGS sí son identidades configuradas a
 * propósito y se sirven aunque no haya base de datos.
 */
async function getClientConfig(clientId) {
  const configurado = getDemoClientConfig(clientId);

  function desdeConfigurado() {
    if (!configurado) return null;
    return {
      id: configurado.id,
      name: configurado.name,
      prompt: injectClientNameIntoPrompt(configurado.name, getFallbackPrompt()),
      webhook: "",
      voiceNumber: defaultVoiceNumber,
    };
  }

  if (!supabase) {
    if (!configurado) {
      reportVoiceError(
        new Error("Sin base de datos y cliente no preconfigurado"),
        "voice.client_config.unresolved",
        { clientId },
        "warning"
      );
    }
    return desdeConfigurado();
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
      return desdeConfigurado();
    }

    return {
      id: data.id,
      name: data.brand_name || data.name || configurado?.name || "Cliente",
      prompt: injectClientNameIntoPrompt(
        data.brand_name || data.name || configurado?.name || "Cliente",
        data.prompt || getFallbackPrompt()
      ),
      webhook: data.webhook || "",
      voiceNumber: data.twilio_number || defaultVoiceNumber,
    };
  } catch (err) {
    reportVoiceError(err, "voice.client_config.exception", { clientId });
    return desdeConfigurado();
  }
}

async function findClientByVoiceNumber(toNumber = "") {
  const normalizedTo = normalizePhone(toNumber);
  if (!normalizedTo || !supabase) return null;

  try {
    const { data, error } = await supabase.from("clients").select("*");
    if (error || !Array.isArray(data)) {
      if (error) {
        reportVoiceError(error, "voice.client_number_lookup.failed", {
          toNumber: normalizedTo,
        });
      }
      return null;
    }

    return (
      data.find(
        (clientRow) =>
          normalizePhone(clientRow.twilio_number || "") === normalizedTo
      ) || null
    );
  } catch (error) {
    reportVoiceError(error, "voice.client_number_lookup.exception", {
      toNumber: normalizedTo,
    });
    return null;
  }
}

async function resolveInboundClientId(req) {
  const explicitClientId =
    String(req.query?.client_id || req.body?.client_id || "").trim() || "";

  if (explicitClientId) {
    return explicitClientId;
  }

  const inboundNumber =
    req.body?.To ||
    req.query?.To ||
    req.body?.Called ||
    req.query?.Called ||
    "";

  const matchedClient = await findClientByVoiceNumber(inboundNumber);
  if (matchedClient?.id) {
    return matchedClient.id;
  }

  return "demo";
}

app.get("/call", async (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).send("No autorizado");
  }

  try {
    const clientId = req.query.client_id || "demo";
    const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");

    const config = await getClientConfig(clientId);
    if (!config) {
      return res.status(404).send("Cliente no encontrado");
    }

    if (hasTelnyxOutboundConfig()) {
      const secretPart = telnyxWebhookSecret
        ? `&secret=${encodeURIComponent(telnyxWebhookSecret)}`
        : "";
      const voiceUrl = `${cleanBaseUrl}/telnyx/voice?client_id=${encodeURIComponent(
        clientId
      )}${secretPart}`;
      const recordingCallback = `${cleanBaseUrl}/recording-status?provider=telnyx&client_id=${encodeURIComponent(
        clientId
      )}${secretPart}`;

      const telnyxResponse = await fetch(
        `https://api.telnyx.com/v2/texml/Accounts/${encodeURIComponent(
          telnyxAccountSid
        )}/Calls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${telnyxApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ApplicationSid: telnyxApplicationId,
            To: process.env.TU_NUMERO,
            From: config.voiceNumber || defaultVoiceNumber,
            Url: voiceUrl,
            UrlMethod: "POST",
            Record: true,
            RecordingChannels: "mono",
            RecordingStatusCallback: recordingCallback,
            RecordingStatusCallbackMethod: "POST",
            RecordingStatusCallbackEvent: "completed",
            SendRecordingUrl: true,
            TimeLimit: 600,
            Timeout: 30,
            StatusCallback: recordingCallback,
            StatusCallbackMethod: "POST",
            StatusCallbackEvent: "answered completed",
          }),
        }
      );

      const payload = await telnyxResponse.json().catch(() => ({}));
      if (!telnyxResponse.ok) {
        throw new Error(
          payload?.errors?.[0]?.detail ||
            payload?.message ||
            "Error iniciando llamada Telnyx"
        );
      }

      console.log("📞 Llamada Telnyx iniciada:", payload, "cliente:", clientId);
      return res.send("Llamada Telnyx iniciada");
    }

    return res
      .status(500)
      .send("No hay configuración Telnyx suficiente para lanzar la llamada");
  } catch (error) {
    reportVoiceError(error, "voice.call.start_failed", {
      clientId: req.query.client_id || "demo",
    });
    res.status(500).send("Error: " + error.message);
  }
});

app.post("/recording-status", async (req, res) => {
  const provider = String(req.query?.provider || req.body?.provider || "").trim();
  const telnyxAccepted =
    (!provider || provider === "telnyx") && isValidTelnyxHttpRequest(req);

  if (!telnyxAccepted) {
    console.warn("🚫 recording-status rechazado por validación inválida");
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
      provider: provider || "telnyx",
    });
    res.status(500).send("error");
  }
});

function buildVoiceTeXml(clientId) {
  const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");
  const streamToken = createVoiceStreamToken(clientId);
  const secretPart = telnyxWebhookSecret
    ? `&secret=${encodeURIComponent(telnyxWebhookSecret)}`
    : "";
  const streamUrl = `${cleanBaseUrl.replace(
    "https://",
    "wss://"
  )}/media-stream?provider=telnyx&client_id=${clientId}&stream_token=${encodeURIComponent(
    streamToken
  )}${secretPart}`;
  const legalNotice = buildVoiceLegalNotice()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${getVoiceAvisoTts()}">${legalNotice}</Say>
  <Connect>
    <Stream
      url="${streamUrl}"
      track="inbound_track"
      codec="PCMU"
      bidirectionalMode="rtp"
      bidirectionalCodec="PCMU"
      bidirectionalSamplingRate="8000"
      enableReconnect="false">
      <Parameter name="client_id" value="${String(clientId || "demo").replace(/"/g, "&quot;")}" />
    </Stream>
  </Connect>
  <Hangup />
</Response>
  `.trim();
}

app.get("/telnyx/voice", async (req, res) => {
  if (!isValidTelnyxHttpRequest(req)) {
    console.warn("🚫 GET /telnyx/voice rechazado por secreto inválido");
    return res.status(403).send("forbidden");
  }

  const clientId = await resolveInboundClientId(req);
  console.log("GET /telnyx/voice");
  console.log(
    "🏢 Cliente detectado en /telnyx/voice:",
    clientId,
    "To:",
    req.query?.To || ""
  );

  const xml = buildVoiceTeXml(clientId);
  res.type("text/xml");
  res.send(xml);
});

app.post("/telnyx/voice", async (req, res) => {
  if (!isValidTelnyxHttpRequest(req)) {
    console.warn("🚫 POST /telnyx/voice rechazado por secreto inválido");
    return res.status(403).send("forbidden");
  }

  const clientId = await resolveInboundClientId(req);
  console.log("POST /telnyx/voice");
  console.log(
    "🏢 Cliente detectado en /telnyx/voice:",
    clientId,
    "To:",
    req.body?.To || ""
  );

  const xml = buildVoiceTeXml(clientId);
  res.type("text/xml");
  res.send(xml);
});

const wss = new WebSocket.Server({ server, path: "/media-stream" });
console.log("✅ WebSocket /media-stream listo");

wss.on("connection", async (providerWs, req) => {
  const url = new URL(req.url, "https://dummy");
  const clientId = url.searchParams.get("client_id") || "demo";
  const provider = "telnyx";
  const streamToken = url.searchParams.get("stream_token") || "";
  const tokenPayload = readVoiceStreamToken(streamToken);

  if (!tokenPayload || tokenPayload.clientId !== clientId) {
    console.warn("🚫 WebSocket /media-stream rechazado por token inválido");
    providerWs.close();
    return;
  }

  console.log(`🟢 ${provider} conectado a /media-stream`);
  console.log("🔥 Cliente WS:", clientId);

  const config = await getClientConfig(clientId);

  if (!config) {
    reportVoiceError(
      new Error("No hay configuración para el cliente"),
      "voice.websocket.missing_client_config",
      { clientId },
      "warning"
    );
    providerWs.close();
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
  let pendingHangup = null;

  /*
   * Estado para cortar la voz cuando el usuario interrumpe.
   *
   * El audio que se manda a la operadora se queda encolado y sigue sonando
   * aunque el modelo deje de generar. Sin esto, la persona empieza a hablar y
   * el agente le pisa encima durante segundos: es lo que más delata que hay
   * una máquina al otro lado. Hace falta saber qué respuesta está sonando y
   * cuánto se ha oído ya, para descartar la cola y decirle al modelo hasta
   * dónde llegó de verdad.
   */
  let msAudioRecibido = 0;        // reloj de la llamada, en ms
  let itemHablando = null;        // id del mensaje que se está reproduciendo
  let msInicioRespuesta = null;   // reloj al empezar a sonar esa respuesta

  /*
   * API GA de Realtime.
   *
   * Antes se conectaba con la cabecera `OpenAI-Beta: realtime=v1`, y esa API
   * ya no existe: OpenAI responde "The Realtime Beta API is no longer
   * supported". Es decir, las llamadas no funcionaban en absoluto, no es que
   * sonaran regular. Comprobado contra la API real antes de cambiarlo.
   *
   * De paso sube de gpt-realtime-1.5 a la versión indicada en MODELO_VOZ.
   */
  const openaiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODELO_VOZ)}`,
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
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
    if (!callSid || !telnyxApiKey) return;

    try {
      const response = await fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(
          callSid
        )}/actions/hangup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${telnyxApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload?.errors?.[0]?.detail ||
            payload?.message ||
            "No se pudo colgar la llamada en Telnyx"
        );
      }

      console.log("📴 Telnyx call completada:", callSid);
    } catch (err) {
      reportVoiceError(
        err,
        "voice.call.hangup_failed",
        { callSid, provider },
        "warning"
      );
    }
  }

  function endCallSoon() {
    console.log("📴 Cerrando llamada...");

    hangupCall();

    try {
      if (providerWs.readyState === WebSocket.OPEN) {
        providerWs.close();
      }
    } catch (err) {
      reportVoiceError(
        err,
        "voice.provider_ws.close_failed",
        { callSid, provider },
        "warning"
      );
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
          type: "realtime",
          model: MODELO_VOZ,
          output_modalities: ["audio"],

          audio: {
            input: {
              // g711 μ-law a 8 kHz: lo que habla la red telefónica.
              format: { type: "audio/pcmu" },

              /*
               * Una llamada trae ruido de fondo, eco de manos libres y calle.
               * Sin esto, el modelo confunde ese ruido con habla y se lanza a
               * responder encima de nadie. far_field es el perfil de móvil y
               * manos libres, que es como llama la gente de verdad.
               */
              noise_reduction: { type: "far_field" },

              transcription: {
                model: "gpt-4o-mini-transcribe",
                // Fijar el idioma evita que una palabra suelta en inglés
                // haga saltar la transcripción de idioma a mitad de llamada.
                language: "es",
              },

              /*
               * El turno se decide por sentido, no por silencio.
               *
               * Estaba en "low", que espera mucho antes de contestar: deja un
               * hueco raro después de cada frase y es de las cosas que más
               * delatan a una máquina. "medium" responde con el ritmo de una
               * persona sin llegar a pisar a quien todavía está pensando.
               */
              turn_detection: {
                type: "semantic_vad",
                eagerness: "medium",
                create_response: true,
                interrupt_response: true,
              },
            },

            output: {
              format: { type: "audio/pcmu" },
              voice: VOZ,
              speed: 1.0,
            },
          },

          instructions: (config.prompt || getFallbackPrompt()).trim(),

          /*
           * Techo de respuesta. Sin límite, el modelo se arranca a explicar y
           * por teléfono un monólogo de treinta segundos es insoportable:
           * quien llama cuelga. Da de sobra para dos o tres frases.
           */
          max_output_tokens: 320,

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

  providerWs.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.event !== "media") {
        console.log(`${provider} event:`, data.event, JSON.stringify(data));
      }

      if (data.event === "connected") {
        console.log(`🔗 ${provider} websocket connected`);
      }

      if (data.event === "start") {
        streamSid =
          data.start?.streamSid ||
          data.streamSid ||
          data.stream_id ||
          null;
        callSid =
          data.start?.callSid ||
          data.start?.call_control_id ||
          data.start?.call_sid ||
          data.start?.call_session_id ||
          null;
        fromNumber =
          data.start?.customParameters?.from ||
          data.start?.from ||
          "";
        toNumber =
          data.start?.customParameters?.to ||
          data.start?.to ||
          "";
        addTranscriptLine("[SYSTEM] Inicio de llamada");
        console.log("📞 Stream iniciado:", streamSid);
        console.log("📞 Call/Control ID:", callSid);
      }

      if (data.event === "media") {
        totalMediaChunks += 1;

        /*
         * Reloj de la llamada. Se usa el sello de tiempo de la operadora si
         * viene; si no, cada trozo de g711 son 20 ms. Sirve para saber cuánto
         * audio del agente se ha llegado a oír antes de una interrupción.
         */
        const sello = Number(data.media?.timestamp);
        msAudioRecibido = Number.isFinite(sello) ? sello : totalMediaChunks * 20;

        if (!streamSid && (data.streamSid || data.stream_id)) {
          streamSid = data.streamSid || data.stream_id;
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
        console.log(`🔴 ${provider} stop recibido`);
        await saveCall(leadCaptured ? "lead_captured" : "completed");

        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      }

      if (data.event === "error") {
        reportVoiceError(
          new Error(data?.payload?.detail || "Provider stream error"),
          "voice.provider_stream.error",
          {
            provider,
            callSid,
            streamSid,
            payload: data?.payload || null,
          },
          "warning"
        );
      }
    } catch (err) {
      reportVoiceError(err, "voice.provider_message.failed", {
        provider,
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
          /*
           * El saludo es lo único que se oye antes de que nadie hable, así
           * que es donde se decide si suena a persona o a centralita. Se
           * pide explícitamente corto y con la fórmula que usa cualquiera al
           * descolgar; sin esto el modelo tiende a soltar una bienvenida
           * comercial de tres frases que delata la máquina en el segundo uno.
           */
          openaiWs.send(
            JSON.stringify({
              type: "response.create",
              response: {
                instructions: `Descuelga el teléfono como lo haría una persona de ${config.name}.
Una sola frase, muy corta, en castellano de España. La fórmula normal:
saludo, nombre de la empresa y en qué puedes ayudar. Por ejemplo
"${config.name}, buenos días, ¿dígame?" o "Hola, ${config.name}, ¿en qué te puedo ayudar?".
Nada de bienvenidas largas, nada de "le atiende", nada de tono de anuncio.
Después de saludar, calla y espera.`,
              },
            })
          );
          console.log("👋 response.create enviado");
        }
      }

      // Guarda qué mensaje se está reproduciendo, para poder truncarlo si
      // la persona interrumpe.
      if (event.type === "response.output_item.added" && event.item?.id) {
        itemHablando = event.item.id;
        msInicioRespuesta = null;
      }

      if (event.type === "input_audio_buffer.speech_started") {
        if (pendingHangup) {
          clearTimeout(pendingHangup);
          pendingHangup = null;
        }

        /*
         * La persona ha empezado a hablar mientras el agente hablaba.
         *
         * Hay que hacer tres cosas, y antes no se hacía ninguna:
         *
         *  1. Cancelar la generación en curso.
         *  2. Vaciar el audio que ya está encolado en la operadora. Esto es
         *     lo que de verdad importa: el modelo puede dejar de generar,
         *     pero lo ya enviado sigue sonando en el auricular y el agente
         *     pisa a quien llama durante segundos.
         *  3. Decirle al modelo hasta qué milisegundo se llegó a oír. Si no,
         *     se queda creyendo que dijo la frase entera y sigue como si la
         *     otra persona la hubiera escuchado.
         */
        if (itemHablando && msInicioRespuesta !== null) {
          const oidoMs = Math.max(0, msAudioRecibido - msInicioRespuesta);

          openaiWs.send(JSON.stringify({ type: "response.cancel" }));

          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.truncate",
              item_id: itemHablando,
              content_index: 0,
              audio_end_ms: oidoMs,
            })
          );

          if (providerWs.readyState === WebSocket.OPEN) {
            providerWs.send(
              JSON.stringify(
                streamSid
                  ? { event: "clear", streamSid }
                  : { event: "clear" }
              )
            );
          }

          console.log(`✋ Interrumpido: se habían oído ${oidoMs} ms`);
          itemHablando = null;
          msInicioRespuesta = null;
        }
      }

      if (
        event.type === "response.audio.delta" ||
        event.type === "response.output_audio.delta"
      ) {
        if (!event.delta) {
          console.log("⚠️ Audio delta sin payload");
        } else if (!streamSid) {
          console.log("⚠️ Audio delta recibido pero no hay streamSid todavía");
        } else {
          // Primer trozo de esta respuesta: se ancla el reloj para poder
          // calcular después cuánto se oyó si la interrumpen.
          if (msInicioRespuesta === null) {
            msInicioRespuesta = msAudioRecibido;
          }

          providerWs.send(
            JSON.stringify({
              event: "media",
              media: { payload: event.delta },
            })
          );
          /* Sin traza por trozo: son unas cincuenta líneas por segundo y
             llamada. Llenaba el registro, costaba CPU y no decía nada que no
             diga ya `response.done`. */
        }
      }

      if (
        event.type === "response.audio.done" ||
        event.type === "response.output_audio.done"
      ) {
        console.log("✅ audio done recibido");
      }

      if (event.type === "response.done") {
        itemHablando = null;
        msInicioRespuesta = null;
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

  providerWs.on("close", async () => {
    console.log(`🔌 ${provider} desconectado`);
    await saveCall(leadCaptured ? "lead_captured" : "completed");

    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  providerWs.on("error", async (err) => {
    reportVoiceError(err, "voice.provider_ws.error", {
      provider,
      callSid,
      streamSid,
    });
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
