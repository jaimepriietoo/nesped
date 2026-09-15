import { getPortalContext } from "@/lib/portal-auth";
import { observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const { data: leads } = await ctx.supabase.from("leads").select("priority_bucket").eq("client_id", ctx.clientId);
    const stats = { urgente: 0, alta: 0, media: 0, baja: 0 };
    (leads || []).forEach(l => {
      const b = String(l.priority_bucket || "baja").toLowerCase();
      if (stats[b] !== undefined) stats[b]++;
    });
 
    return Response.json({ success: true, data: stats });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.analytics.priority-stats.get", manejarGET);
