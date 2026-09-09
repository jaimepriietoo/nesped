import { getPortalContext } from "@/lib/portal-auth";
import { exigirContactoPropio } from "@/lib/server/pertenencia";
 
export async function GET(req) {
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
      .from("lead_notes")
      .select("*")
      .eq("client_id", ctx.clientId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, data: data || [] });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
 
export async function POST(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const { lead_id, body: noteBody } = await req.json();

    /* El id del contacto viene de la petición: sin esta comprobación se
       podían colgar apuntes en contactos de otra empresa. */
    const ajeno = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId: lead_id });
    if (ajeno) return ajeno;
    const { data, error } = await ctx.supabase.from("lead_notes").insert({
      lead_id,
      body: noteBody,
      author: ctx.currentUser?.full_name || ctx.userEmail || "Sistema",
      client_id: ctx.clientId,
    }).select().single();
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, data });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}