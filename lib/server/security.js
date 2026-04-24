import crypto from "crypto";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { isAuthorizedInternalRequest } from "@/lib/server/internal-api";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 5000;

const rateLimitStore =
  globalThis.__nespedRateLimitStore || new Map();

if (!globalThis.__nespedRateLimitStore) {
  globalThis.__nespedRateLimitStore = rateLimitStore;
}

function normalizeHost(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function hashKey(parts = []) {
  return crypto
    .createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex");
}

function cleanupRateLimitStore(now = Date.now()) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (!entry || entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  if (rateLimitStore.size <= MAX_RATE_LIMIT_ENTRIES) {
    return;
  }

  const sortedEntries = [...rateLimitStore.entries()].sort(
    (a, b) => Number(a[1]?.resetAt || 0) - Number(b[1]?.resetAt || 0)
  );

  while (sortedEntries.length > MAX_RATE_LIMIT_ENTRIES) {
    const [key] = sortedEntries.shift();
    rateLimitStore.delete(key);
  }
}

function getAllowedHosts(req) {
  const hosts = new Set();
  const rawHostHeaders = [
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
  ];

  rawHostHeaders.forEach((value) => {
    const normalized = normalizeHost(value);
    if (normalized) hosts.add(normalized);
  });

  [process.env.NEXT_PUBLIC_APP_URL, process.env.BASE_URL].forEach((value) => {
    if (!value) return;

    try {
      hosts.add(normalizeHost(new URL(value).host));
    } catch {}
  });

  return hosts;
}

function matchesAllowedHost(value, allowedHosts) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return allowedHosts.has(normalizeHost(url.host));
  } catch {
    return false;
  }
}

export function getRequestIp(req) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const forwardedIp = forwardedFor.split(",")[0]?.trim();

  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    forwardedIp ||
    "unknown"
  );
}

export function isSameOriginRequest(req) {
  const allowedHosts = getAllowedHosts(req);
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  if (!origin && !referer) {
    return false;
  }

  if (origin && !matchesAllowedHost(origin, allowedHosts)) {
    return false;
  }

  if (referer && !matchesAllowedHost(referer, allowedHosts)) {
    return false;
  }

  return true;
}

export function requireSameOrigin(
  req,
  message = "Origen no permitido para esta acción"
) {
  if (isAuthorizedInternalRequest(req)) {
    return null;
  }

  if (isSameOriginRequest(req)) {
    return null;
  }

  return Response.json(
    {
      success: false,
      message,
    },
    { status: 403 }
  );
}

export function consumeRateLimit({
  namespace,
  keyParts = [],
  limit,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
}) {
  const now = Date.now();
  cleanupRateLimitStore(now);

  const compositeKey = `${namespace}:${hashKey(keyParts)}`;
  const existing = rateLimitStore.get(compositeKey);

  let entry = existing;
  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
  }

  if (entry.count >= limit) {
    rateLimitStore.set(compositeKey, entry);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit,
    };
  }

  entry.count += 1;
  rateLimitStore.set(compositeKey, entry);

  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
    limit,
  };
}

export function requireRateLimit(
  req,
  {
    namespace,
    limit,
    windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
    keyParts = [],
    message = "Demasiados intentos. Prueba de nuevo en unos minutos.",
  }
) {
  if (isAuthorizedInternalRequest(req)) {
    return null;
  }

  const rateLimit = consumeRateLimit({
    namespace,
    limit,
    windowMs,
    keyParts: [namespace, getRequestIp(req), ...keyParts.map(normalizeValue)],
  });

  if (rateLimit.allowed) {
    return null;
  }

  const retryAfter = Math.max(
    1,
    Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
  );

  return Response.json(
    {
      success: false,
      message,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(rateLimit.resetAt),
      },
    }
  );
}

export async function requirePortalRoleOrInternal(
  req,
  allowedRoles = ["owner", "admin", "manager"],
  options = {}
) {
  if (isAuthorizedInternalRequest(req)) {
    return { ok: true, type: "internal", ctx: null };
  }

  const sameOriginError = requireSameOrigin(
    req,
    options.sameOriginMessage || "Origen no permitido"
  );

  if (sameOriginError) {
    return { ok: false, response: sameOriginError };
  }

  const ctx = await getPortalContext();
  if (!ctx.ok) {
    return {
      ok: false,
      response: Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: ctx.status || 401 }
      ),
    };
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !hasRole(ctx.role, allowedRoles)
  ) {
    return {
      ok: false,
      response: Response.json(
        {
          success: false,
          message:
            options.forbiddenMessage ||
            "Sin permisos para ejecutar esta acción",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    type: "portal",
    ctx,
  };
}
