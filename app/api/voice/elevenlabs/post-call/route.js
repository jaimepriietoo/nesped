import {
  persistElevenLabsCall,
  verifyElevenLabsWebhookSignature,
} from "@/lib/server/elevenlabs";

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const hasValidHmac = verifyElevenLabsWebhookSignature({
      rawBody,
      signatureHeader: req.headers.get("ElevenLabs-Signature") || "",
    });

    if (!hasValidHmac) {
      return Response.json(
        {
          success: false,
          message: "Webhook de ElevenLabs no autorizado",
        },
        { status: 401 }
      );
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const result = await persistElevenLabsCall({ payload });

    return Response.json({
      success: true,
      data: result,
    });
  } catch {
    return Response.json(
      {
        success: false,
        message: "No se pudo procesar la llamada de ElevenLabs",
      },
      { status: 500 }
    );
  }
}
