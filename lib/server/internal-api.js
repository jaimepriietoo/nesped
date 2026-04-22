function getInternalApiToken() {
  return (
    process.env.INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
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

  const received = req.headers.get("x-nesped-internal-token") || "";
  return received === expected;
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
