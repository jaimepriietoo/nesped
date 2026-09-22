import { requireInternalRequest } from "@/lib/server/internal-api";
import { upsertElevenLabsLead } from "@/lib/server/elevenlabs";
import { observeRoute } from "@/lib/server/observability.mjs";
import { LeadElevenLabs, validar } from "@/lib/server/esquemas";
import { leerJsonLimitado } from "@/lib/server/security";

async function manejarPOST(req) {
  try {
    const authError = requireInternalRequest(req);
    if (authError) return authError;

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 64 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(LeadElevenLabs, cuerpo.datos, { mensaje: "Lead no válido" });
    if (leido.respuesta) return leido.respuesta;
    const body = leido.datos;
    const result = await upsertElevenLabsLead({
      clientId: body?.clientId,
      callerId: body?.callerId,
      calledNumber: body?.calledNumber,
      conversationId: body?.conversationId,
      name: body?.name,
      email: body?.email,
      phone: body?.phone,
      city: body?.city,
      address: body?.address,
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
        message: "No se pudo guardar el lead de ElevenLabs",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.voice.elevenlabs.upsert-lead.post", manejarPOST);
