import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { AutomatismoCambio } from "@/lib/server/esquemas-portal";
import { automatismosDeEmpresa, fijarAutomatismo, ejecucionesRecientes, DISPAROS } from "@/lib/server/automatismos";
import { estadoDeLaIA } from "@/lib/server/estado-ia";
import { interruptoresDePlataforma } from "@/lib/server/interruptores";

/** Los automatismos de la empresa, su estado y lo último que hicieron. */
async function manejarGET() {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "routing.view", ctx.permissions)) return sinPermiso();
  try {
    const [piezas, ejecuciones, ia, plataforma] = await Promise.all([
      automatismosDeEmpresa(ctx.clientId, ctx.datos),
      ejecucionesRecientes(ctx.clientId, { supabase: ctx.datos }),
      estadoDeLaIA(ctx.clientId),
      interruptoresDePlataforma(),
    ]);
    return Response.json({
      success: true,
      data: piezas,
      ejecuciones,
      disparos: DISPAROS,
      ia: { activa: ia.activa, motivo: ia.motivo, funciones: ia.funciones },
      pausa: { global: Boolean(plataforma?.pausa_global), motivo: plataforma?.motivo || null },
      puedeEditar: puede(ctx.role, "routing.manage", ctx.permissions),
    });
  } catch (err) {
    logErrorSeguro("portal.automations_read_failed", err);
    return Response.json({ success: false, message: "No se pudieron leer los automatismos" }, { status: 500 });
  }
}

async function manejarPATCH(req) {
  const origen = requireSameOrigin(req);
  if (origen) return origen;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "routing.manage", ctx.permissions)) return sinPermiso("Sólo el propietario o un administrador pueden cambiar los automatismos.");
  const limited = await requireRateLimitAsync(req, {
    namespace: "portal:automations-config", limit: 30,
    keyParts: [ctx.clientId, ctx.userEmail], includeIp: false,
  });
  if (limited) return limited;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(AutomatismoCambio, cuerpo.datos);
  if (leido.respuesta) return leido.respuesta;
  try {
    const { tipo, ...cambios } = leido.datos;
    const fila = await fijarAutomatismo(ctx.clientId, tipo, cambios, ctx.datos);
    await ctx.datos.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "automatismo",
      entity_id: tipo,
      action: "automatismo_cambiado",
      actor: ctx.userEmail,
      changes: {
        activo: cambios.activo,
        modo: cambios.modo,
        config_fields: Object.keys(cambios.config || {}).sort(),
      },
    });
    return Response.json({ success: true, data: fila });
  } catch (err) {
    return Response.json({ success: false, message: err?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export const GET = observeRoute("api.portal.automatismos.get", manejarGET);
export const PATCH = observeRoute("api.portal.automatismos.patch", manejarPATCH);
