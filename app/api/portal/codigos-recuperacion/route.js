import { getPortalContext } from "@/lib/portal-auth";
import { codigosDisponibles, generarCodigos } from "@/lib/server/codigos-recuperacion";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

/**
 * Códigos de recuperación de la propia cuenta.
 *
 * Siempre los de quien pide, nunca los de otro: el correo sale de la sesión y
 * no se acepta por parámetro. Un dueño de empresa no puede generarle códigos a
 * un compañero, porque eso sería una forma cómoda de entrar en su cuenta.
 */

/** Cuántos quedan. No devuelve los códigos: no se pueden volver a ver. */
export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json({ success: false, message: ctx.message }, { status: 401 });
    }

    return Response.json({
      success: true,
      disponibles: await codigosDisponibles(ctx.userEmail),
    });
  } catch (error) {
    console.error("GET /api/portal/codigos-recuperacion error:", error);
    return Response.json({ success: false, message: "No se pudo consultar" }, { status: 500 });
  }
}

/**
 * Genera una tanda nueva. Invalida la anterior entera.
 *
 * Es la única vez que los códigos existen en claro: se devuelven aquí y no se
 * guardan más que como hash. Si quien los pide cierra la pestaña sin
 * copiarlos, tiene que generar otros.
 */
export async function POST(req) {
  try {
    const origenError = requireSameOrigin(req, "Origen no permitido");
    if (origenError) return origenError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json({ success: false, message: ctx.message }, { status: 401 });
    }

    /* Generar invalida los anteriores, así que hacerlo en bucle sería una
       forma de dejar a alguien sin códigos válidos. */
    const limiteError = await requireRateLimitAsync(req, {
      namespace: `codigos:${ctx.userEmail}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      message: "Has generado códigos varias veces seguidas. Espera un rato.",
    });
    if (limiteError) return limiteError;

    const codigos = await generarCodigos({
      email: ctx.userEmail,
      clientId: ctx.clientId,
    });

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "auth",
      entity_id: ctx.userEmail,
      action: "codigos_recuperacion_generados",
      actor: ctx.userEmail,
      changes: JSON.stringify({ cuantos: codigos.length }),
    });

    return Response.json({ success: true, codigos });
  } catch (error) {
    console.error("POST /api/portal/codigos-recuperacion error:", error);
    return Response.json(
      { success: false, message: "No se pudieron generar los códigos" },
      { status: 500 }
    );
  }
}
