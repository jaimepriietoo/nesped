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
    logEvent("error", "process.unhandled_rejection", {
      service,
      error: sanitizeError(reason instanceof Error ? reason : new Error(String(reason))),
    });
  });

  process.on("uncaughtException", (error) => {
    logEvent("error", "process.uncaught_exception", {
      service,
      error: sanitizeError(error),
    });
  });

  logEvent("info", "process.handlers_registered", { service });
}
