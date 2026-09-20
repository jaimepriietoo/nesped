import { executeNextBestAction } from "@/lib/server/next-best-action-service";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { leerJsonLimitado } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { EjecutarAccionRecomendada } from "@/lib/server/esquemas-operaciones";

async function manejarPOST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(EjecutarAccionRecomendada, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const { leadId, clientId, actor } = leido.datos;

    const result = await executeNextBestAction({
      leadId,
      clientId,
      actor,
    });

    return Response.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    logErrorSeguro("automation.execute_next_action_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error ejecutando la acción recomendada",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.automation.run-nba.execute-next-action.post", manejarPOST);
