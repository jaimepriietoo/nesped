import crypto from "crypto";

function getInternalApiToken() {
  return (
    process.env.INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
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

  if (!expected) return false;

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

  return Response.json(
    {
      success: false,
      message: "No autorizado",
    },
    { status: 401 }
  );
}
