import { requireInternalRequest } from "@/lib/server/internal-api";
import { buildElevenLabsContext } from "@/lib/server/elevenlabs";

export async function POST(req) {
  try {
    const authError = requireInternalRequest(req);
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));
    const context = await buildElevenLabsContext({
      clientId: body?.clientId,
      callerId: body?.callerId,
      calledNumber: body?.calledNumber,
      conversationId: body?.conversationId,
    });

    return Response.json({
      success: true,
      ...context,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message:
          error.message || "No se pudo cargar el contexto para ElevenLabs",
      },
      { status: 500 }
    );
  }
}
