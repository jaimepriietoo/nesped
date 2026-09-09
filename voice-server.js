require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const Sentry = require("@sentry/node");
const { createClient } = require("@supabase/supabase-js");
const { empezarLatido } = require("./lib/server/latido-cola.cjs");

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

console.log("NESPED · servicio de fondo");
console.log("Portal:", process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || "(sin definir)");
console.log("Puerto:", process.env.PORT || 3001);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);

/* ═════════════════════════════════════════════════════════════════════════
   Qué queda de este servicio, y por qué queda.

   Este proceso atendía las llamadas: recibía el audio de Telnyx por un
   WebSocket, lo pasaba a OpenAI Realtime, devolvía la voz sintetizada y al
   colgar guardaba la llamada. Eran unas mil ochocientas líneas.

   Ya no. La conversación la lleva ElevenLabs Agents, que tiene integración
   nativa con Twilio: se le da el número y ElevenLabs se encarga del audio de
   punta a punta. Nesped pone las herramientas HTTP que el agente consulta
   durante la llamada y recibe el webhook del final. Todo eso vive en la
   aplicación de Next:

     /api/voice/elevenlabs/context      contexto de empresa y contacto
     /api/voice/elevenlabs/upsert-lead  crear o actualizar el contacto
     /api/voice/elevenlabs/post-call    guardar la llamada al colgar

   Puentear audio en tiempo real era la parte más frágil del producto y ya no
   la hacemos nosotros.

   ENTONCES, ¿POR QUÉ SIGUE EXISTIENDO ESTE SERVICIO?

   Por el latido de la cola. Los trabajos de fondo —informes, archivado,
   copias de grabaciones— los ejecuta /api/cola/procesar, y alguien tiene que
   llamarlo. El cron de Vercel serviría, pero la cuenta está en plan Hobby,
   donde los cron corren UNA VEZ AL DÍA: un informe pedido a las nueve de la
   mañana saldría mañana.

   Este proceso está encendido las veinticuatro horas y llamar cada treinta
   segundos no le cuesta nada. Es un servicio pequeño con un trabajo pequeño,
   y decirlo así es mejor que disfrazarlo de servidor de voz que ya no es.
   ═════════════════════════════════════════════════════════════════════════ */

const hasSupabase = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get("/", (req, res) => {
  res.type("text/plain").send(
    [
      "NESPED · servicio de fondo",
      "",
      "Las llamadas las atiende ElevenLabs Agents sobre Twilio.",
      "Este proceso sólo empuja la cola de trabajos.",
      "",
      "  /healthz   estado",
    ].join("\n")
  );
});

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "nesped-fondo",
    /* Se dice lo que este proceso necesita para su único trabajo. Antes aquí
       se informaba de OpenAI y de Telnyx; enseñar el estado de proveedores
       que ya no usa sería peor que no enseñar nada. */
    env: {
      hasSupabase,
      hasBaseUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL),
      hasInternalToken: Boolean(
        process.env.INTERNAL_API_TOKEN || process.env.CRON_SECRET
      ),
      hasSentryDsn: isVoiceSentryEnabled(),
    },
    now: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NESPED · servicio de fondo en el puerto ${PORT}`);

  /* La cola necesita que alguien la empuje. Ver lib/server/latido-cola.cjs,
     incluido por qué la ejecución sigue del otro lado. */
  empezarLatido({
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL,
    token: process.env.INTERNAL_API_TOKEN || process.env.CRON_SECRET,
  });
});
