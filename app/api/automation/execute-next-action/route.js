import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { executeNextBestAction } from "@/lib/server/next-best-action-service";
import { validar } from "@/lib/server/esquemas";
import { AccionSobreLead } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para ejecutar acciones"
    );
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "automations.run", ctx.permissions)) {
      return Response.json(
        { success: false, message: "Sin permisos para ejecutar la acción" },
        { status: 403 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "automation-execute-action",
      limit: 30,
      keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(AccionSobreLead, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const result = await executeNextBestAction({
      supabase: ctx.supabase,
      leadId: entrada.datos.leadId,
      clientId: ctx.clientId,
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
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

export const POST = observeRoute("api.automation.execute-next-action.post", manejarPOST);
