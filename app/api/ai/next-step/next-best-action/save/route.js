import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { requireInternalRequest } from "@/lib/server/internal-api";

export async function POST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { leadId, clientId, brandName, useAI = true, actor = "system" } = body;

    const result = await saveNextBestAction({
      leadId,
      clientId,
      brandName,
      useAI,
      actor,
    });

    return Response.json({
      success: true,
      data: result.lead,
      recommendation: result.recommendation,
    });
  } catch (error) {
    console.error("POST /api/ai/next-step/next-best-action/save error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error guardando la acción recomendada",
      },
      { status: 500 }
    );
  }
}
