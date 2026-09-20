import { memoriaDeLead, guardarMemoriaLead } from "@/lib/server/datos";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { exigirContactoPropio } from "@/lib/server/pertenencia";
import { validar } from "@/lib/server/esquemas";
import { MemoriaDeLead } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarGET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    if (!leadId) return Response.json({ success: false, message: "Falta lead_id" }, { status: 400 });
 
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const denied = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId });
    if (denied) return denied;
    const memory = await memoriaDeLead(leadId);
    return Response.json({ success: true, data: memory || null });
  } catch (err) {
    logErrorSeguro("lead_memory.read_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}
 
async function manejarPOST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!puede(ctx.role, "crm.edit", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const limite = await requireRateLimitAsync(req, {
      namespace: "lead-memory", limit: 60, keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(MemoriaDeLead, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const body = entrada.datos;
    const { lead_id } = body;
    const denied = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId: lead_id });
    if (denied) return denied;
    const fields = new Set(["last_intent", "last_objection", "temperature", "recommended_product", "last_summary"]);
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => fields.has(key)).map(([key, value]) => [key, String(value || "").slice(0, 2000)]));
 
    const memory = await guardarMemoriaLead(lead_id, payload, ctx.clientId);
    return Response.json({ success: true, data: memory });
  } catch (err) {
    logErrorSeguro("lead_memory.write_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.lead-memory.get", manejarGET);
export const POST = observeRoute("api.lead-memory.post", manejarPOST);
