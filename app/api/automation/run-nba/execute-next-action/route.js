import { executeNextBestAction } from "@/lib/server/next-best-action-service";
import { requireInternalRequest } from "@/lib/server/internal-api";

export async function POST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { leadId, clientId, actor = "system" } = body;

    const result = await executeNextBestAction({
      leadId,
      clientId,
      actor,
    });

    return Response.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error("POST /api/automation/run-nba/execute-next-action error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error ejecutando la acción recomendada",
      },
      { status: 500 }
    );
  }
}
