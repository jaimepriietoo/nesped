import { getPortalContext } from "@/lib/portal-auth";
import { buildWorkflowStudioData } from "@/lib/server/portal-phase-four";
import { getClientMessageExperimentSnapshot } from "@/lib/server/portal-phase-two";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes, leadsRes, callsRes, alertsRes, auditRes] =
      await Promise.all([
        ctx.supabase.from("clients").select("id,name,brand_name,industry").eq("id", ctx.clientId).single(),
        ctx.supabase.from("client_settings").select("*").eq("client_id", ctx.clientId).maybeSingle(),
        ctx.supabase
          .from("leads")
          .select("id,status,score,owner,updated_at,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(1000),
        ctx.supabase
          .from("calls")
          .select("id,status,result,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(400),
        ctx.supabase
          .from("alerts")
          .select("id,title,message,severity,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(60),
        ctx.supabase
          .from("audit_logs")
          .select("*")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);

    const errors = [
      clientRes.error,
      settingsRes.error,
      leadsRes.error,
      callsRes.error,
      alertsRes.error,
      auditRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Workflow Studio");
    }

    const leads = leadsRes.data || [];
    const experiments = await getClientMessageExperimentSnapshot({
      leadIds: leads.map((lead) => lead.id).filter(Boolean),
    });

    return Response.json({
      success: true,
      data: buildWorkflowStudioData({
        client: clientRes.data || {},
        settings: settingsRes.data || {},
        leads,
        calls: callsRes.data || [],
        alerts: alertsRes.data || [],
        auditLogs: auditRes.data || [],
        experiments,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Workflow Studio",
      },
      { status: 500 }
    );
  }
}
