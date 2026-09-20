import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { leerJsonLimitado, requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { ClasificarContacto } from "@/lib/server/esquemas-portal";
import { clasificarYActuar } from "@/lib/server/clasificacion";

/** Clasificar un contacto a mano, ahora, y que actúen los automatismos. */
async function manejarPOST(req) {
  const origen = requireSameOrigin(req);
  if (origen) return origen;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "crm.edit", ctx.permissions)) return sinPermiso();
  const limitado = await requireRateLimitAsync(req, { namespace: "clasificar", limit: 60, keyParts: [ctx.clientId], includeIp: false });
  if (limitado) return limitado;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(ClasificarContacto, cuerpo.datos);
  if (leido.respuesta) return leido.respuesta;
  try {
    const r = await clasificarYActuar({ clientId: ctx.clientId, leadId: leido.datos.lead_id, supabase: ctx.datos });
    const { lead: _lead, ...clasificacion } = r.clasificacion;
    return Response.json({ success: true, clasificacion, automatismos: r.automatismos });
  } catch (err) {
    logErrorSeguro("portal.contact_classify_failed", err);
    return Response.json({ success: false, message: "No se pudo clasificar" }, { status: 500 });
  }
}

export const POST = observeRoute("api.portal.contactos.clasificar.post", manejarPOST);
