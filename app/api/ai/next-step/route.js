import { requireSameOrigin } from "@/lib/server/security";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { validar } from "@/lib/server/esquemas";
import { AccionSobreLead } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarPOST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!puede(ctx.role, "ai.use", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const limite = await requireRateLimitAsync(req, {
      namespace: "ai-next-step",
      limit: 30,
      keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(AccionSobreLead, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const { leadId } = entrada.datos;
 
    const result = await saveNextBestAction({
      supabase: ctx.supabase,
      leadId,
      clientId: ctx.clientId,
      brandName: entrada.datos.brandName || "nuestro equipo",
      useAI: true,
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal",
    });
 
    return Response.json({ success: true, data: result.lead, recommendation: result.recommendation });
  } catch (err) {
    logErrorSeguro("ai.next_step_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const POST = observeRoute("api.ai.next-step.post", manejarPOST);
