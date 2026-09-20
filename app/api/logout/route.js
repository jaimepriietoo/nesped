import { clearAuthCookies } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";
import { requireSameOrigin } from "@/lib/server/security";

async function manejarPOST(req) {
  const origen = requireSameOrigin(req, "Origen no permitido para cerrar sesión");
  if (origen) return origen;

  await clearAuthCookies();

  return Response.json({ success: true });
}

export const POST = observeRoute("api.logout.post", manejarPOST);
