import { getPortalContext } from "@/lib/portal-auth";
import { buildCopilotWorkspace } from "@/lib/portal-product";
import { getClientPaymentRows } from "@/lib/server/portal-phase-two";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, leadsRes, callsRes, alertsRes, insightsRes] =
      await Promise.all([
        ctx.supabase
          .from("clients")
          .select("id,name,brand_name")
          .eq("id", ctx.clientId)
          .single(),
        ctx.supabase
          .from("leads")
          .select(
            "id,nombre,status,score,owner,next_action,next_step_ai,followup_sms_sent,valor_estimado,created_at,updated_at"
          )
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(1000),
        ctx.supabase
          .from("calls")
          .select("id,status,summary,lead_captured,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(200),
        ctx.supabase
          .from("alerts")
          .select("id,title,message,severity,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(20),
        ctx.supabase
          .from("ai_insights")
          .select("id,title,body,priority,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const errors = [
      clientRes.error,
      leadsRes.error,
      callsRes.error,
      alertsRes.error,
      insightsRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Copilot");
    }

    const payments = await getClientPaymentRows(ctx.clientId, 1000);

    return Response.json({
      success: true,
      data: buildCopilotWorkspace({
        client: clientRes.data || {},
        leads: leadsRes.data || [],
        calls: callsRes.data || [],
        alerts: alertsRes.data || [],
        insights: insightsRes.data || [],
        payments,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Copilot",
      },
      { status: 500 }
    );
  }
}
