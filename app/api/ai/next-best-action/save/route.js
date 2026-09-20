import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { isAuthorizedInternalRequest } from "@/lib/server/internal-api";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { AccionRecomendadaInterna } from "@/lib/server/esquemas-operaciones";

async function manejarPOST(req) {
  try {
    // Allow internal requests (from automation)
    const isInternal = isAuthorizedInternalRequest(req);
    let supabase, clientId, actor;

    if (!isInternal) {
      const sameOriginError = requireSameOrigin(
        req,
        "Origen no permitido para generar acciones IA"
      );
      if (sameOriginError) return sameOriginError;
    }

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(AccionRecomendadaInterna, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const { leadId, brandName, useAI } = leido.datos;

    if (isInternal) {
      const { createAdminSupabase } = await import("@/lib/server/next-best-action-service");
      supabase = createAdminSupabase();
      clientId = leido.datos.clientId;
      actor = "system";
    } else {
      const ctx = await getPortalContext();
      if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
      if (!puede(ctx.role, "ai.use", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
      const limited = await requireRateLimitAsync(req, {
        namespace: "portal:next-best-action",
        limit: 20,
        keyParts: [ctx.clientId, ctx.userEmail],
        includeIp: false,
      });
      if (limited) return limited;
      supabase = ctx.supabase;
      clientId = ctx.clientId;
      actor = ctx.currentUser?.full_name || ctx.userEmail || "portal";
    }
 
    if (!leadId || !clientId) return Response.json({ success: false, message: "Faltan leadId o clientId" }, { status: 400 });
 
    const result = await saveNextBestAction({ supabase, leadId, clientId, brandName, useAI, actor });
    return Response.json({ success: true, data: result.lead, recommendation: result.recommendation });
  } catch (err) {
    logErrorSeguro("ai.next_best_action_save_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const POST = observeRoute("api.ai.next-best-action.save.post", manejarPOST);
