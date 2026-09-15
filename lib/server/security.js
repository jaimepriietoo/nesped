import crypto from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedInternalRequest } from "@/lib/server/internal-api";
import { getRequestIp, isSameOriginRequest } from "@/lib/server/request-policy";
export { getRequestIp, isSameOriginRequest } from "@/lib/server/request-policy";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const rateLimitStore = new Map();

function hashKey(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts.map(String))).digest("hex");
}
export function requireSameOrigin(req, message = "Origen no permitido para esta acción") {
  if (isAuthorizedInternalRequest(req) || isSameOriginRequest(req)) return null;
  return Response.json({ success: false, message }, { status: 403 });
}

// Sólo para pruebas y desarrollo sin base configurada.
export function consumeRateLimit({ namespace, keyParts = [], limit, windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS }) {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) if (entry.resetAt <= now) rateLimitStore.delete(key);
  const key = namespace + ":" + hashKey(keyParts);
  if (!rateLimitStore.has(key) && rateLimitStore.size >= 5000) {
    return { allowed: false, remaining: 0, resetAt: now + windowMs, limit };
  }
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  entry.count = Math.min(entry.count + 1, limit + 1);
  rateLimitStore.set(key, entry);
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit-entry.count), resetAt: entry.resetAt, limit };
}

export async function consumeRateLimitAsync({ namespace, keyParts = [], limit, windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS }) {
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return consumeRateLimit({ namespace, keyParts, limit, windowMs });
  }
  // Una única operación atómica, compartida por todas las instancias.
  // Si no está disponible, se rechaza la acción: no hay contador local de respaldo.
  const { data, error } = await getSupabase().rpc("consumir_limite_seguridad", {
    p_key: namespace + ":" + hashKey(keyParts), p_limit: limit, p_window_ms: windowMs,
  });
  if (error || !data || typeof data.allowed !== "boolean") throw new Error("Control de intentos no disponible");
  return data;
}

export async function requireRateLimitAsync(req, {
  namespace, limit, windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  keyParts = [], includeIp = true, message = "Demasiados intentos. Prueba de nuevo en unos minutos.",
}) {
  let result;
  try {
    result = await consumeRateLimitAsync({
      namespace, limit, windowMs,
      keyParts: [...(includeIp ? [getRequestIp(req)] : []), ...keyParts.map(value => String(value || "").trim().toLowerCase())],
    });
  } catch {
    return Response.json({ success: false, message: "La operación no está disponible temporalmente." },
      { status: 503, headers: { "Retry-After": "30" } });
  }
  if (result.allowed) return null;
  return Response.json({ success: false, message }, {
    status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((result.resetAt-Date.now())/1000))) },
  });
}
