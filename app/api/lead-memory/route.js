import { prisma } from "@/lib/prisma";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { exigirContactoPropio } from "@/lib/server/pertenencia";
import { requireSameOrigin } from "@/lib/server/security";
 
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    if (!leadId) return Response.json({ success: false, message: "Falta lead_id" }, { status: 400 });
 
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const denied = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId });
    if (denied) return denied;
    const memory = await prisma.leadMemory.findUnique({ where: { lead_id: leadId } });
    return Response.json({ success: true, data: memory || null });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}
 
export async function POST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const body = await req.json();
    const { lead_id } = body;
    if (!lead_id) return Response.json({ success: false, message: "Falta lead_id" }, { status: 400 });
    const denied = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId: lead_id });
    if (denied) return denied;
    const fields = new Set(["last_intent", "last_objection", "temperature", "recommended_product", "last_summary"]);
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => fields.has(key)).map(([key, value]) => [key, String(value || "").slice(0, 2000)]));
 
    const memory = await prisma.leadMemory.upsert({
      where: { lead_id },
      update: payload,
      create: { lead_id, ...payload },
    });
    return Response.json({ success: true, data: memory });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}
