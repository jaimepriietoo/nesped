import { clearAuthCookies } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST() {
  await clearAuthCookies();

  return Response.json({ success: true });
}

export const POST = observeRoute("api.logout.post", manejarPOST);
