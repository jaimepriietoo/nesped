import { requireInternalRequest } from "@/lib/server/internal-api";
import { upsertElevenLabsLead } from "@/lib/server/elevenlabs";

export async function POST(req) {
  try {
    const authError = requireInternalRequest(req);
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));
    const result = await upsertElevenLabsLead({
      clientId: body?.clientId,
      callerId: body?.callerId,
      calledNumber: body?.calledNumber,
      conversationId: body?.conversationId,
      name: body?.name,
      city: body?.city,
      need: body?.need,
      preference: body?.preference,
      summary: body?.summary,
      owner: body?.owner,
      status: body?.status,
      notes: body?.notes,
    });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo guardar el lead de ElevenLabs",
      },
      { status: 500 }
    );
  }
}
