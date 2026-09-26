import crypto from "crypto";

function getInternalApiToken() {
  return (
    process.env.INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    ""
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(req) {
  const authorization = req.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

export function getInternalApiHeaders() {
  const token = getInternalApiToken();

  return token
    ? {
        "x-nesped-internal-token": token,
      }
    : {};
}

export function isAuthorizedInternalRequest(req) {
  const expected = getInternalApiToken();

  if (expected.length < 32 || expected === process.env.SUPABASE_SERVICE_ROLE_KEY || expected === process.env.NESPED_SESSION_SECRET) return false;

  const received =
    req.headers.get("x-nesped-internal-token") ||
    readBearerToken(req) ||
    "";

  return safeEqual(received, expected);
}

export function requireInternalRequest(req) {
  if (isAuthorizedInternalRequest(req)) {
    return null;
  }

  return noAutorizado();
}

function noAutorizado() {
  return Response.json(
    {
      success: false,
      message: "No autorizado",
    },
    { status: 401 }
  );
}

/**
 * Quién puede empujar la cola.
 *
 * Lo mismo que cualquier ruta interna (el latido de Railway manda el token
 * interno) y, además, `Authorization: Bearer <CRON_SECRET>`: es lo que mandan
 * el cron de Vercel y el latido de Supabase (pg_cron + pg_net, con el secreto
 * guardado en Vault).
 *
 * CRON_SECRET sólo abre esta ruta. Si se filtra desde la base de datos, lo más
 * que permite es adelantar una pasada de la cola; no escribe contactos ni lee
 * contexto de llamadas, que es lo que protege INTERNAL_API_TOKEN.
 *
 * Sólo se lee de cabeceras: un secreto en la URL acaba en registros de acceso.
 */
export function isAuthorizedColaRequest(req) {
  if (isAuthorizedInternalRequest(req)) return true;

  const expected = process.env.CRON_SECRET || "";
  if (expected.length < 32) return false;
  if (
    [
      process.env.INTERNAL_API_TOKEN,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.NESPED_SESSION_SECRET,
    ]
      .filter(Boolean)
      .includes(expected)
  ) {
    return false;
  }

  return safeEqual(readBearerToken(req), expected);
}

export function requireColaRequest(req) {
  return isAuthorizedColaRequest(req) ? null : noAutorizado();
}
