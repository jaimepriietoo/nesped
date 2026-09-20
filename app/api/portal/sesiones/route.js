import { getPortalContext } from "@/lib/portal-auth";
import { validar } from "@/lib/server/esquemas";
import { CerrarSesion } from "@/lib/server/esquemas-portal";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { cerrarSesion, listarSesiones } from "@/lib/server/sesiones";

/**
 * Las sesiones abiertas de quien pregunta, y cerrar una sola.
 *
 * "Cerrar todas" sigue en /api/portal/sesiones/revocar. Esto es para el caso
 * más frecuente: "me dejé el portal abierto en el ordenador de la oficina".
 */
async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    const sesiones = await listarSesiones({
      email: ctx.userEmail, clientId: ctx.clientId, sidActual: ctx.session?.sid || null,
    });
    return Response.json({ success: true, sesiones }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.sesiones_list_failed", error);
    return Response.json({ success: false, message: "No se pudieron leer las sesiones" }, { status: 500 });
  }
}

async function manejarPOST(req) {
  try {
    const origen = requireSameOrigin(req);
    if (origen) return origen;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    const limite = await requireRateLimitAsync(req, {
      namespace: "portal:sesiones-cerrar", limit: 20, keyParts: [ctx.clientId, ctx.userEmail], includeIp: false,
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(CerrarSesion, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;

    const cerrada = await cerrarSesion({ sid: entrada.datos.id, email: ctx.userEmail, clientId: ctx.clientId });
    if (!cerrada) return Response.json({ success: false, message: "Esa sesión no existe o ya estaba cerrada" }, { status: 404 });

    const { error } = await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId, entity_type: "session", entity_id: entrada.datos.id,
      action: "session_revoked", actor: ctx.userEmail, changes: {},
    });
    if (error) logErrorSeguro("portal.sesiones_audit_failed", error);

    const eraLaActual = entrada.datos.id === ctx.session?.sid;
    return Response.json({ success: true, actual: eraLaActual, message: eraLaActual ? "Has cerrado esta sesión." : "Sesión cerrada." });
  } catch (error) {
    logErrorSeguro("portal.sesiones_close_failed", error);
    return Response.json({ success: false, message: "No se pudo cerrar la sesión" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.sesiones.get", manejarGET);
export const POST = observeRoute("api.portal.sesiones.post", manejarPOST);
