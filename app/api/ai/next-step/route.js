import { requireSameOrigin } from "@/lib/server/security";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
 
export async function POST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!puede(ctx.role, "ai.use")) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const body = await req.json();
    const { leadId } = body;
    if (!leadId) return Response.json({ success: false, message: "Falta leadId" }, { status: 400 });
 
    const result = await saveNextBestAction({
      supabase: ctx.supabase,
      leadId,
      clientId: ctx.clientId,
      brandName: body.brandName || "nuestro equipo",
      useAI: true,
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal",
    });
 
    return Response.json({ success: true, data: result.lead, recommendation: result.recommendation });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}
