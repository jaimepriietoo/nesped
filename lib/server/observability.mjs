import {
  captureServerException,
  getSentryStatus,
} from "@/lib/server/sentry.mjs";

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

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {}
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
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };

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

export function observeRoute(name, handler) {
  return async function observedRoute(req, context) {
    const startedAt = Date.now();
    const request = getRequestMetadata(req);

    try {
      const response = await handler(req, context);
      logEvent("info", "route.completed", {
        route: name,
        durationMs: Date.now() - startedAt,
        status: response?.status || 200,
        ...request,
      });
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
