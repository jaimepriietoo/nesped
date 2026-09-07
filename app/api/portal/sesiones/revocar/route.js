import { getPortalContext } from "@/lib/portal-auth";
import { revocarSesionesDe } from "@/lib/server/auth";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

/**
 * Cierra todas las sesiones abiertas de quien lo pide.
 *
 * Cerrar sesión sólo borra la cookie del navegador donde se pulsa. Si te has
 * dejado la sesión abierta en un ordenador ajeno, o sospechas que alguien ha
 * entrado, eso no sirve de nada. Esto invalida el token en todas partes a la
 * vez, incluida la sesión desde la que se pide.
 */
export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para cerrar sesiones"
    );
    if (sameOriginError) return sameOriginError;

    const limiteError = await requireRateLimitAsync(req, {
      namespace: "portal:revocar-sesiones",
      limit: 10,
      windowMs: 15 * 60 * 1000,
      message: "Demasiadas veces seguidas. Espera unos minutos.",
    });
    if (limiteError) return limiteError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const resultado = await revocarSesionesDe(ctx.userEmail);
    if (!resultado.ok) {
      return Response.json(
        { success: false, message: "No se pudieron cerrar las sesiones" },
        { status: 500 }
      );
    }

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "session",
      entity_id: ctx.userEmail,
      action: "sessions_revoked",
      actor: ctx.userEmail,
      changes: JSON.stringify({ epoch: resultado.epoch }),
      created_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: "Se han cerrado todas las sesiones. Vuelve a entrar.",
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cerrando sesiones" },
      { status: 500 }
    );
  }
}
