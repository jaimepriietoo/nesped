import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { Departamentos } from "@/lib/server/esquemas-portal";
import { departamentosDeEmpresa, DEPARTAMENTOS_POR_DEFECTO } from "@/lib/server/departamentos";

/**
 * Los departamentos de la empresa. GET los devuelve (los de serie si no
 * hay propios); PUT los sustituye enteros: es una lista corta que se edita
 * completa en el portal, y así no hay estados a medias.
 */
async function manejarGET() {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "routing.view", ctx.permissions)) return sinPermiso();
  try {
    const { lista, deSerie } = await departamentosDeEmpresa(ctx.clientId, ctx.datos);
    return Response.json({ success: true, data: lista, deSerie, deSerieDisponibles: DEPARTAMENTOS_POR_DEFECTO, puedeEditar: puede(ctx.role, "routing.manage", ctx.permissions) });
  } catch (err) {
    logErrorSeguro("portal.departments_read_failed", err);
    return Response.json({ success: false, message: "No se pudieron leer los departamentos" }, { status: 500 });
  }
}

async function manejarPUT(req) {
  const origen = requireSameOrigin(req);
  if (origen) return origen;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "routing.manage", ctx.permissions)) return sinPermiso("Sólo el propietario o un administrador pueden cambiar los departamentos.");

  const limited = await requireRateLimitAsync(req, {
    namespace: "portal:departments", limit: 20,
    keyParts: [ctx.clientId, ctx.userEmail], includeIp: false,
  });
  if (limited) return limited;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 32 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(Departamentos, cuerpo.datos);
  if (leido.respuesta) return leido.respuesta;
  const lista = leido.datos.departamentos;
  if (new Set(lista.map((d) => d.clave)).size !== lista.length) {
    return Response.json({ success: false, message: "Hay dos departamentos con la misma clave" }, { status: 400 });
  }
  /* Ya no se añade un "otro" a la fuerza: lo que no encaja queda sin
     clasificar y lo decide una persona. */

  try {
    const filas = lista.map((d, i) => ({ client_id: ctx.clientId, clave: d.clave, nombre: d.nombre, descripcion: d.descripcion, palabras_clave: d.palabras_clave, areas: d.areas || [], orden: d.orden || i, activo: d.activo, updated_at: new Date().toISOString() }));
    const { error } = await ctx.datos.from("departamentos").upsert(filas, { onConflict: "client_id,clave" });
    if (error) throw new Error(error.message);
    const claves = lista.map((d) => d.clave);
    const { error: e2 } = await ctx.datos.from("departamentos").delete().not("clave", "in", `(${claves.map((c) => `"${c}"`).join(",")})`);
    if (e2) throw new Error(e2.message);
    await ctx.datos.from("audit_logs").insert({ client_id: ctx.clientId, entity_type: "departamentos", entity_id: ctx.clientId, action: "departamentos_actualizados", actor: ctx.userEmail, changes: { claves } });
    const { lista: nueva, deSerie } = await departamentosDeEmpresa(ctx.clientId, ctx.datos);
    return Response.json({ success: true, data: nueva, deSerie });
  } catch (err) {
    logErrorSeguro("portal.departments_update_failed", err);
    return Response.json({ success: false, message: "No se pudieron guardar los departamentos" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.departamentos.get", manejarGET);
export const PUT = observeRoute("api.portal.departamentos.put", manejarPUT);
