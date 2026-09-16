import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
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
  const leido = validar(ClasificarContacto, await req.json().catch(() => ({})));
  if (leido.respuesta) return leido.respuesta;
  try {
    const r = await clasificarYActuar({ clientId: ctx.clientId, leadId: leido.datos.lead_id, supabase: ctx.datos });
    const { lead: _lead, ...clasificacion } = r.clasificacion;
    return Response.json({ success: true, clasificacion, automatismos: r.automatismos });
  } catch (err) {
    console.error("[portal/contactos/clasificar]", err?.message || err);
    return Response.json({ success: false, message: err?.message || "No se pudo clasificar" }, { status: 500 });
  }
}

export const POST = observeRoute("api.portal.contactos.clasificar.post", manejarPOST);
