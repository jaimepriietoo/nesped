import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { isAuthorizedInternalRequest } from "@/lib/server/internal-api";
import { requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarPOST(req) {
  try {
    // Allow internal requests (from automation)
    const isInternal = isAuthorizedInternalRequest(req);
    let supabase, clientId, leadId, brandName, useAI, actor;
 
    const body = await req.json();
    leadId = body.leadId;
    brandName = body.brandName || "nuestro equipo";
    useAI = body.useAI !== false;
 
    if (isInternal) {
      const { createAdminSupabase } = await import("@/lib/server/next-best-action-service");
      supabase = createAdminSupabase();
      clientId = body.clientId;
      actor = "system";
    } else {
      const sameOriginError = requireSameOrigin(
        req,
        "Origen no permitido para generar acciones IA"
      );
      if (sameOriginError) return sameOriginError;

      const ctx = await getPortalContext();
      if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
      if (!puede(ctx.role, "ai.use", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
      supabase = ctx.supabase;
      clientId = ctx.clientId;
      actor = ctx.currentUser?.full_name || ctx.userEmail || "portal";
    }
 
    if (!leadId || !clientId) return Response.json({ success: false, message: "Faltan leadId o clientId" }, { status: 400 });
 
    const result = await saveNextBestAction({ supabase, leadId, clientId, brandName, useAI, actor });
    return Response.json({ success: true, data: result.lead, recommendation: result.recommendation });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const POST = observeRoute("api.ai.next-best-action.save.post", manejarPOST);
