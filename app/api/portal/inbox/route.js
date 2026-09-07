import { getPortalContext } from "@/lib/portal-auth";
import { buildInboxThreads } from "@/lib/portal-product";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [leadsRes, callsRes] = await Promise.all([
      ctx.supabase
        .from("leads")
        .select(
          "id,nombre,email,telefono,status,owner,score,interes,predicted_close_probability,next_action,next_action_priority,valor_estimado,necesidad,created_at,updated_at"
        )
        .eq("client_id", ctx.clientId)
        .order("updated_at", { ascending: false })
        .limit(400),
      ctx.supabase
        .from("calls")
        .select(
          "id,call_sid,from_number,to_number,status,summary,summary_long,transcript,recording_url,duration_seconds,lead_captured,created_at"
        )
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(400),
    ]);

    const baseErrors = [
      leadsRes.error,
      callsRes.error,
    ].filter(Boolean);

    if (baseErrors.length > 0) {
      throw new Error(baseErrors[0].message || "No se pudo cargar el inbox");
    }

    const leads = leadsRes.data || [];
    const leadIds = leads.map((lead) => lead.id).filter(Boolean);

    let reminders = [];
    if (leadIds.length > 0) {
      const { data, error } = await ctx.supabase
        .from("lead_reminders")
        .select("id,lead_id,title,assigned_to,remind_at,created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) {
        throw new Error(error.message || "No se pudieron cargar recordatorios");
      }

      reminders = data || [];
    }

    /*
     * Los eventos se buscan sólo por lead_id.
     *
     * Antes había una segunda consulta `.in("phone", phones)`, pero
     * lead_events no tiene columna `phone` —sus columnas son id, lead_id,
     * client_id, type, title, description, meta y created_at—, así que
     * Postgres devolvía error y el inbox entero respondía 500. Estaba roto
     * siempre que la cuenta tuviera algún lead con teléfono, es decir casi
     * siempre.
     */
    let events = [];

    if (leadIds.length > 0) {
      const { data, error } = await ctx.supabase
        .from("lead_events")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(800);

      if (error) {
        throw new Error(error.message || "No se pudieron cargar eventos");
      }

      events = data || [];
    }

    const inbox = buildInboxThreads({
      leads,
      calls: callsRes.data || [],
      events,
      reminders,
    });

    return Response.json({
      success: true,
      data: inbox,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar el inbox",
      },
      { status: 500 }
    );
  }
}
