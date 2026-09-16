import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { webhookKey } from "@/lib/server/webhook-signing";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false }, { status: 401 });
  if (!puede(ctx.role, "api.manage", ctx.permissions)) return Response.json({ success: false }, { status: 403 });
  const limited = await requireRateLimitAsync(req, { namespace: "webhook:key", limit: 5, keyParts: [ctx.userEmail], includeIp: false });
  if (limited) return limited;
  return Response.json({ success: true, key: webhookKey(ctx.clientId), version: 1 }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = observeRoute("api.portal.webhook.key.post", manejarPOST);
