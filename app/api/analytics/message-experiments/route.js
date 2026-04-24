import { getPortalContext } from "@/lib/portal-auth";
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
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
