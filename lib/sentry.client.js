import * as Sentry from "@sentry/nextjs";

const SECRET_FIELD_PATTERN =
  /authorization|cookie|set-cookie|token|secret|password|api[_-]?key|dsn|x-nesped-internal-token/i;

let initialized = false;

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function sanitizeObject(value, depth = 0) {
  if (depth > 3 || value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 15).map((item) => sanitizeObject(item, depth + 1));
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
}

export function isClientSentryEnabled() {
  return Boolean(String(process.env.NEXT_PUBLIC_SENTRY_DSN || "").trim());
}

export function initClientSentry() {
  if (initialized || !isClientSentryEnabled()) {
    return false;
  }

  initialized = true;

  Sentry.init({
    dsn: String(process.env.NEXT_PUBLIC_SENTRY_DSN || "").trim(),
    enabled: true,
    environment:
      String(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "").trim() ||
      process.env.NODE_ENV ||
      "development",
    release: String(process.env.NEXT_PUBLIC_SENTRY_RELEASE || "").trim() || undefined,
    debug: String(process.env.NEXT_PUBLIC_SENTRY_DEBUG || "").trim() === "1",
    sendDefaultPii: false,
    attachStacktrace: true,
    sampleRate: numberEnv("NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE", 1),
    tracesSampleRate: numberEnv(
      "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
      process.env.NODE_ENV === "production" ? 0.15 : 1
    ),
    replaysSessionSampleRate: numberEnv(
      "NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE",
      0
    ),
    replaysOnErrorSampleRate: numberEnv(
      "NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE",
      0
    ),
    ignoreErrors: [/AbortError/i, /ResizeObserver loop/i, /NetworkError/i],
    beforeSend,
    initialScope: {
      tags: {
        service: "next-client",
      },
    },
  });

  return true;
}
