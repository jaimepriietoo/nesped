import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { leerJsonLimitado } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { AccionRecomendadaInterna } from "@/lib/server/esquemas-operaciones";

async function manejarPOST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(AccionRecomendadaInterna, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const { leadId, clientId, brandName, useAI, actor } = leido.datos;
    if (!clientId) {
      return Response.json({ success: false, message: "Falta clientId" }, { status: 400 });
    }

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
    logErrorSeguro("ai.next_step_save_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error guardando la acción recomendada",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.ai.next-step.next-best-action.save.post", manejarPOST);
