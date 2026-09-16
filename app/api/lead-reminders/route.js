import { requireSameOrigin } from "@/lib/server/security";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { exigirContactoPropio } from "@/lib/server/pertenencia";
import { observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarGET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });

    /* Pedía sesión y leía por lead_id sin mirar de quién era ese contacto:
       cualquier cliente podía sacar los datos de otro pasando su id. */
    const ajeno = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId });
    if (ajeno) return ajeno;

    const { data, error } = await ctx.supabase
      .from("lead_reminders")
      .select("*")
      .eq("client_id", ctx.clientId)
      .eq("lead_id", leadId)
      .order("remind_at", { ascending: true });
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, data: data || [] });
  } catch (err) {
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
 
    const { lead_id, title, remind_at, assigned_to } = await req.json();

    /* El id del contacto viene de la petición: sin esta comprobación se
       podían colgar apuntes en contactos de otra empresa. */
    const ajeno = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId: lead_id });
    if (ajeno) return ajeno;
    const { data, error } = await ctx.supabase.from("lead_reminders").insert({
      lead_id, title, remind_at, assigned_to, client_id: ctx.clientId,
    }).select().single();
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, data });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.lead-reminders.get", manejarGET);
export const POST = observeRoute("api.lead-reminders.post", manejarPOST);
