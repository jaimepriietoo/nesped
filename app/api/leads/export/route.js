import { getPortalContext } from "@/lib/portal-auth";
 
export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const { data: leads } = await ctx.supabase.from("leads").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false });
 
    const cols = ["id","nombre","email","telefono","ciudad","necesidad","fuente","status","score","predicted_close_probability","interes","valor_estimado","next_action","next_action_priority","next_action_reason","owner","followup_sms_sent","created_at","updated_at"];
    const escape = v => `"${String(v || "").replace(/"/g, '""')}"`;
    const rows = [cols.join(","), ...(leads || []).map(l => cols.map(c => escape(l[c])).join(","))].join("\n");
 
    return new Response(rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}