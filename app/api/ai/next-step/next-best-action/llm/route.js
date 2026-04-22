import { createAdminSupabase, generateNextBestActionLlmRecommendation } from "@/lib/server/next-best-action-service";
import { getNextBestActionRules } from "@/lib/next-best-action";
import { requireInternalRequest } from "@/lib/server/internal-api";

function predictCloseProbability(lead) {
  const score = Number(lead?.score || 0);
  const status = String(lead?.status || "new");

  let base = score;
  if (status === "contacted") base += 10;
  if (status === "qualified") base += 20;
  if (status === "won") base = 100;
  if (status === "lost") base = 0;
  if (lead?.followup_sms_sent) base += 5;
  if (lead?.next_step_ai) base += 5;
  if (lead?.owner) base += 5;

  return Math.max(0, Math.min(100, base));
}

export async function POST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { leadId, clientId, brandName = "nuestro equipo" } = body;

    if (!leadId || !clientId) {
      return Response.json(
        { success: false, message: "Faltan leadId o clientId" },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabase();
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("client_id", clientId)
      .single();

    if (error || !lead) {
      return Response.json(
        { success: false, message: error?.message || "Lead no encontrado" },
        { status: 404 }
      );
    }

    const hydratedLead = {
      ...lead,
      predicted_close_probability:
        lead.predicted_close_probability ?? predictCloseProbability(lead),
    };
    const fallback = getNextBestActionRules(hydratedLead, brandName);
    const data = await generateNextBestActionLlmRecommendation({
      lead: hydratedLead,
      brandName,
      fallback,
    });

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("POST /api/ai/next-step/next-best-action/llm error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error generando NBA con IA",
      },
      { status: 500 }
    );
  }
}
