import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";
 
export async function PATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para actualizar leads"
    );
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!hasRole(ctx.role, ["owner","admin","manager","agent"])) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const body = await req.json();
    const { leadId, ...updates } = body;
    if (!leadId) return Response.json({ success: false, message: "Falta leadId" }, { status: 400 });
 
    const { data: lead, error } = await ctx.supabase
      .from("leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .select("*")
      .single();
 
    if (error) throw new Error(error.message);
 
    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: leadId,
      action: "lead_updated",
      actor: ctx.currentUser?.full_name || ctx.userEmail,
      changes: updates,
    });
 
    return Response.json({ success: true, data: lead });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
