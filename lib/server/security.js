import crypto from "node:crypto";
import { getSupabaseAdministrativo } from "@/lib/supabase";
import { isAuthorizedInternalRequest } from "@/lib/server/internal-api";
import { getRequestIp, isSameOriginRequest } from "@/lib/server/request-policy";
export { getRequestIp, isSameOriginRequest } from "@/lib/server/request-policy";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;
const rateLimitStore = new Map();

function hashKey(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts.map(String))).digest("hex");
}
export function requireSameOrigin(req, message = "Origen no permitido para esta acción") {
  if (isAuthorizedInternalRequest(req) || isSameOriginRequest(req)) return null;
  return Response.json({ success: false, message }, { status: 403 });
}

function respuestaDeCuerpo(message, status) {
  return Response.json({ success: false, message }, { status });
}

/** Lee el cuerpo sin confiar sólo en Content-Length (una petición chunked no
 * lo trae). La ruta decide el máximo según el proveedor y conserva el texto
 * exacto para comprobar firmas HMAC antes de parsearlo. */
export async function leerTextoLimitado(req, { maxBytes = DEFAULT_BODY_LIMIT_BYTES } = {}) {
  const declarado = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    return { respuesta: respuestaDeCuerpo("La solicitud es demasiado grande", 413) };
  }

  try {
    if (!req.body?.getReader) {
      const datos = await req.text();
      if (new TextEncoder().encode(datos).byteLength > maxBytes) {
        return { respuesta: respuestaDeCuerpo("La solicitud es demasiado grande", 413) };
      }
      return { datos };
    }

    const reader = req.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { respuesta: respuestaDeCuerpo("La solicitud es demasiado grande", 413) };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { datos: new TextDecoder().decode(bytes) };
  } catch {
    return { respuesta: respuestaDeCuerpo("No se pudo leer la solicitud", 400) };
  }
}

export async function leerJsonLimitado(req, opciones) {
  const leido = await leerTextoLimitado(req, opciones);
  if (leido.respuesta) return leido;
  try {
    return { datos: leido.datos ? JSON.parse(leido.datos) : {} };
  } catch {
    return { respuesta: respuestaDeCuerpo("El cuerpo debe ser JSON válido", 400) };
  }
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
  /* El contador protege rutas de todas las empresas y no contiene datos de
     negocio. Es una de las pocas operaciones cruzadas deliberadas, por eso
     pide el cliente administrativo por su nombre en vez de heredar el RLS de
     una petición del portal. */
  const { data, error } = await getSupabaseAdministrativo().rpc("consumir_limite_seguridad", {
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
