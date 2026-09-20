import {
  captureServerException,
  getSentryStatus,
} from "@/lib/server/sentry.mjs";
import { conContexto, contextoActual, idDePeticion } from "@/lib/server/contexto.mjs";
import { redactData } from "@/lib/server/redaction.mjs";

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

async function dispatchOpsAlert(payload) {
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL || "";
  if (!webhookUrl) return;

  /* La comprobación DNS y el transporte fijado necesitan APIs de Node. Next
     sustituye NEXT_RUNTIME al compilar cada runtime y elimina esta rama del
     bundle Edge. Expresarlo como rama positiva es importante: un retorno
     temprano seguido del import seguía haciendo que Webpack empaquetara
     node:dns, node:net y node:https dentro del Proxy. */
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { peticionExternaSegura } = await import("@/lib/server/url-segura");
      await peticionExternaSegura(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {}
  }
}

function readHeader(req, key) {
  if (!req?.headers?.get) return "";
  return req.headers.get(key) || "";
}

export function getRequestMetadata(req) {
  return {
    method: req?.method || "",
    path: req?.nextUrl?.pathname || "",
    host: readHeader(req, "host"),
    forwardedFor: readHeader(req, "x-forwarded-for"),
    userAgent: readHeader(req, "user-agent").slice(0, 160),
  };
}

export function logEvent(level = "info", event = "log", data = {}) {
  /* El contexto —petición, trabajo, empresa— va en cada línea sin que quien
     registra tenga que saberlo. Es lo que permite juntar después todo lo que
     pasó en una misma petición o en un mismo trabajo. */
  const payload = redactData({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...contextoActual(),
    ...data,
  });

  const line = JSON.stringify(payload);

  if (level === "error") {
    void dispatchOpsAlert(payload);
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

/** Registra sólo la forma útil del error y deja que el redactor elimine
 * correos, teléfonos, URLs con consulta y cualquier secreto conocido. */
export function logErrorSeguro(event, error, data = {}) {
  logEvent("error", event, {
    ...data,
    error: sanitizeError(error instanceof Error ? error : new Error(String(error || "Error"))),
  });
}

export function observeRoute(name, handler) {
  return async function observedRoute(req, context) {
    const startedAt = Date.now();
    const request = getRequestMetadata(req);
    const requestId = idDePeticion(req);

    /* Todo lo que la ruta registre lleva su id de petición y su nombre. */
    return conContexto({ request_id: requestId, route: name }, () => ejecutar());

    async function ejecutar() {
    try {
      const response = await handler(req, context);
      try { response?.headers?.set?.("x-nesped-request-id", requestId); } catch {}
      logEvent("info", "route.completed", {
        route: name,
        durationMs: Date.now() - startedAt,
        status: response?.status || 200,
        ...request,
      });
      /* Un 403 con sesión es alguien pidiendo lo que no puede. Se anota
         para que la regla de anomalías lo cuente; sin esperar, y sólo en
         Node (el import dinámico lo deja fuera del bundle del proxy). */
      const ctx = contextoActual();
      if (response?.status === 403 && ctx.client_id && ctx.user_email && typeof process !== "undefined" && process.versions?.node) {
        void import("@/lib/server/anomalias")
          .then((m) => m.anotarDenegacion({ clientId: ctx.client_id, email: ctx.user_email, role: ctx.role, ruta: name }))
          .catch(() => {});
      }
      return response;
    } catch (error) {
      void captureServerException(error, {
        level: "error",
        tags: {
          kind: "route",
          route: name,
        },
        contexts: {
          request,
        },
      });
      logEvent("error", "route.failed", {
        route: name,
        durationMs: Date.now() - startedAt,
        ...request,
        error: sanitizeError(error),
      });
      throw error;
    }
    }
  };
}

let processHandlersRegistered = false;

export function registerProcessHandlers(service = "next-app") {
  if (processHandlersRegistered || typeof process === "undefined") {
    return;
  }

  processHandlersRegistered = true;

  process.on("unhandledRejection", (reason) => {
    void captureServerException(
      reason instanceof Error ? reason : new Error(String(reason)),
      {
        level: "error",
        tags: {
          kind: "process",
          signal: "unhandledRejection",
          service,
        },
      }
    );
    logEvent("error", "process.unhandled_rejection", {
      service,
      error: sanitizeError(reason instanceof Error ? reason : new Error(String(reason))),
    });
  });

  process.on("uncaughtException", (error) => {
    void captureServerException(error, {
      level: "fatal",
      tags: {
        kind: "process",
        signal: "uncaughtException",
        service,
      },
    });
    logEvent("error", "process.uncaught_exception", {
      service,
      error: sanitizeError(error),
    });
  });

  logEvent("info", "process.handlers_registered", { service });
}

export function getObservabilityStatus() {
  return {
    logFormat: "json",
    opsAlertWebhookConfigured: Boolean(
      String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim()
    ),
    sentry: getSentryStatus(),
  };
}
