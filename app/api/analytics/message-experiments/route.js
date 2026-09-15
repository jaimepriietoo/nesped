import { getPortalContext } from "@/lib/portal-auth";
import { getClientMessageExperimentSnapshot } from "@/lib/server/portal-phase-two";
import { observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const { data: leads, error } = await ctx.supabase
      .from("leads")
      .select("id")
      .eq("client_id", ctx.clientId)
      .limit(1000);

    if (error) {
      throw new Error(error.message);
    }

    const snapshot = await getClientMessageExperimentSnapshot({
      leadIds: (leads || []).map((lead) => lead.id).filter(Boolean),
    });

    return Response.json({
      success: true,
      data: snapshot.variants,
      summary: snapshot.summary,
      channelBreakdown: snapshot.channelBreakdown,
      stageBreakdown: snapshot.stageBreakdown,
      suggestions: snapshot.suggestions,
    });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.analytics.message-experiments.get", manejarGET);
