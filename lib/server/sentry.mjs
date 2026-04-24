import * as Sentry from "@sentry/nextjs";

const SECRET_FIELD_PATTERN =
  /authorization|cookie|set-cookie|token|secret|password|api[_-]?key|dsn|x-nesped-internal-token/i;

let initializedRuntime = "";

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeRuntime(runtime = process.env.NEXT_RUNTIME || "nodejs") {
  return runtime === "edge" ? "edge" : "nodejs";
}

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

function sanitizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [
      key,
      SECRET_FIELD_PATTERN.test(key) ? "[redacted]" : value,
    ])
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
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SECRET_FIELD_PATTERN.test(key)
        ? "[redacted]"
        : sanitizeObject(nestedValue, depth + 1),
    ])
  );
}

function beforeSend(event) {
  const nextEvent = { ...event };

  if (nextEvent.request?.headers) {
    nextEvent.request = {
      ...nextEvent.request,
      headers: sanitizeHeaders(nextEvent.request.headers),
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
}

export function getServerSentryDsn() {
  return (
    String(process.env.SENTRY_DSN || "").trim() ||
    String(process.env.NEXT_PUBLIC_SENTRY_DSN || "").trim()
  );
}

export function getSentryEnvironment() {
  return (
    String(process.env.SENTRY_ENVIRONMENT || "").trim() ||
    String(process.env.VERCEL_ENV || "").trim() ||
    String(process.env.RAILWAY_ENVIRONMENT || "").trim() ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function getSentryRelease() {
  return (
    String(process.env.SENTRY_RELEASE || "").trim() ||
    String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim() ||
    String(process.env.RAILWAY_GIT_COMMIT_SHA || "").trim() ||
    String(process.env.GIT_COMMIT_SHA || "").trim()
  );
}

export function isServerSentryEnabled() {
  return Boolean(getServerSentryDsn());
}

function buildServerSentryOptions(runtime = "nodejs") {
  const isProduction = process.env.NODE_ENV === "production";
  const release = getSentryRelease();

  return {
    dsn: getServerSentryDsn(),
    enabled: isServerSentryEnabled(),
    environment: getSentryEnvironment(),
    release: release || undefined,
    debug: String(process.env.SENTRY_DEBUG || "").trim() === "1",
    sendDefaultPii: false,
    attachStacktrace: true,
    sampleRate: numberEnv("SENTRY_ERROR_SAMPLE_RATE", 1),
    tracesSampleRate: numberEnv(
      "SENTRY_TRACES_SAMPLE_RATE",
      isProduction ? 0.15 : 1
    ),
    profilesSampleRate: numberEnv("SENTRY_PROFILES_SAMPLE_RATE", 0),
    ignoreErrors: [
      /AbortError/i,
      /ResizeObserver loop/i,
      /NetworkError/i,
    ],
    beforeSend,
    initialScope: {
      tags: {
        service: runtime === "edge" ? "next-edge" : "next-app",
        runtime,
      },
    },
  };
}

export function getSentryStatus() {
  const release = getSentryRelease();

  return {
    configured: isServerSentryEnabled(),
    runtime: normalizeRuntime(),
    environment: getSentryEnvironment(),
    release: release || "",
    dsnPreview: isServerSentryEnabled()
      ? `${getServerSentryDsn().slice(0, 18)}***`
      : "",
    tracesSampleRate: numberEnv(
      "SENTRY_TRACES_SAMPLE_RATE",
      process.env.NODE_ENV === "production" ? 0.15 : 1
    ),
    profilesSampleRate: numberEnv("SENTRY_PROFILES_SAMPLE_RATE", 0),
    authTokenConfigured: Boolean(
      String(process.env.SENTRY_AUTH_TOKEN || "").trim()
    ),
    orgConfigured: Boolean(String(process.env.SENTRY_ORG || "").trim()),
    projectConfigured: Boolean(String(process.env.SENTRY_PROJECT || "").trim()),
  };
}

export async function ensureServerSentry(runtime = normalizeRuntime()) {
  const normalizedRuntime = normalizeRuntime(runtime);
  if (!isServerSentryEnabled()) {
    return false;
  }

  if (initializedRuntime === normalizedRuntime) {
    return true;
  }

  Sentry.init(buildServerSentryOptions(normalizedRuntime));
  initializedRuntime = normalizedRuntime;
  return true;
}

function applyScope(scope, { tags = {}, contexts = {}, extra = {}, level } = {}) {
  Object.entries(tags).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      scope.setTag(key, String(value));
    }
  });

  Object.entries(contexts).forEach(([key, value]) => {
    if (value !== undefined) {
      scope.setContext(key, sanitizeObject(value));
    }
  });

  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined) {
      scope.setExtra(key, sanitizeObject(value));
    }
  });

  if (level) {
    scope.setLevel(level);
  }
}

export async function captureServerException(error, context = {}) {
  if (!isServerSentryEnabled()) {
    return null;
  }

  await ensureServerSentry();

  return Sentry.withScope((scope) => {
    applyScope(scope, context);
    return Sentry.captureException(normalizeError(error));
  });
}

export async function captureServerMessage(message, context = {}) {
  if (!isServerSentryEnabled()) {
    return null;
  }

  await ensureServerSentry();

  return Sentry.withScope((scope) => {
    applyScope(scope, context);
    return Sentry.captureMessage(String(message || "server.message"));
  });
}

export async function captureNextRequestError(error, request, context) {
  if (!isServerSentryEnabled()) {
    return false;
  }

  await ensureServerSentry();

  try {
    Sentry.captureRequestError(error, request, context);
  } catch {
    await captureServerException(error, {
      tags: {
        kind: "next.request_error",
        routeType: context?.routeType || "",
        routePath: context?.routePath || "",
      },
      contexts: {
        request,
        next: context,
      },
    });
  }

  return true;
}

export async function flushServerSentry(timeout = 2000) {
  if (!isServerSentryEnabled()) {
    return true;
  }

  try {
    return await Sentry.flush(timeout);
  } catch {
    return false;
  }
}
