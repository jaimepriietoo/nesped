import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { Destinatario, DestinatarioParcial, BorrarDestinatario } from "@/lib/server/esquemas-portal";

/**
 * Quién recibe cada contacto. GET lista; POST crea; PATCH cambia; DELETE
 * borra. Configurarlo es cosa del propietario o de un administrador (o de
 * un manager con la casilla): decidir a quién le llegan los datos de
 * quien llama no se hereda del rol.
 */
const SIN_SESION = () => Response.json({ success: false, message: "No autorizado" }, { status: 401 });

async function manejarGET() {
  const ctx = await getPortalContext();
  if (!ctx.ok) return SIN_SESION();
  if (!puede(ctx.role, "routing.view", ctx.permissions)) return sinPermiso();
  const { data, error } = await ctx.datos.from("destinatarios").select("*").order("created_at");
  if (error) return Response.json({ success: false, message: "No se pudieron leer los destinatarios" }, { status: 500 });
  const { data: ultimas } = await ctx.datos.from("notificaciones_lead")
    .select("id, lead_id, email, motivo, estado, error, created_at").order("created_at", { ascending: false }).limit(30);
  return Response.json({ success: true, data: data || [], notificaciones: ultimas || [], puedeEditar: puede(ctx.role, "routing.manage", ctx.permissions) });
}

async function conPermiso(req) {
  const origen = requireSameOrigin(req);
  if (origen) return { respuesta: origen };
  const ctx = await getPortalContext();
  if (!ctx.ok) return { respuesta: SIN_SESION() };
  if (!puede(ctx.role, "routing.manage", ctx.permissions)) return { respuesta: sinPermiso("Sólo el propietario o un administrador pueden cambiar quién recibe los contactos.") };
  return { ctx };
}

async function auditar(ctx, action, changes) {
  await ctx.datos.from("audit_logs").insert({ client_id: ctx.clientId, entity_type: "destinatarios", entity_id: changes?.id || ctx.clientId, action, actor: ctx.userEmail, changes });
}

async function manejarPOST(req) {
  const { ctx, respuesta } = await conPermiso(req);
  if (respuesta) return respuesta;
  const leido = validar(Destinatario, await req.json().catch(() => ({})));
  if (leido.respuesta) return leido.respuesta;
  const { data, error } = await ctx.datos.from("destinatarios").insert({ ...leido.datos, client_id: ctx.clientId }).select("*").single();
  if (error) return Response.json({ success: false, message: "No se pudo crear el destinatario" }, { status: 500 });
  await auditar(ctx, "destinatario_creado", { id: data.id, email: data.email, departamentos: data.departamentos });
  return Response.json({ success: true, data });
}

async function manejarPATCH(req) {
  const { ctx, respuesta } = await conPermiso(req);
  if (respuesta) return respuesta;
  const leido = validar(DestinatarioParcial, await req.json().catch(() => ({})));
  if (leido.respuesta) return leido.respuesta;
  const { id, ...cambios } = leido.datos;
  const { data, error } = await ctx.datos.from("destinatarios").update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
  if (error) return Response.json({ success: false, message: "No se pudo guardar" }, { status: 500 });
  if (!data) return Response.json({ success: false, message: "No existe" }, { status: 404 });
  await auditar(ctx, "destinatario_actualizado", { id, ...cambios });
  return Response.json({ success: true, data });
}

async function manejarDELETE(req) {
  const { ctx, respuesta } = await conPermiso(req);
  if (respuesta) return respuesta;
  const leido = validar(BorrarDestinatario, await req.json().catch(() => ({})));
  if (leido.respuesta) return leido.respuesta;
  const { error } = await ctx.datos.from("destinatarios").delete().eq("id", leido.datos.id);
  if (error) return Response.json({ success: false, message: "No se pudo borrar" }, { status: 500 });
  await auditar(ctx, "destinatario_borrado", { id: leido.datos.id });
  return Response.json({ success: true });
}

export const GET = observeRoute("api.portal.destinatarios.get", manejarGET);
export const POST = observeRoute("api.portal.destinatarios.post", manejarPOST);
export const PATCH = observeRoute("api.portal.destinatarios.patch", manejarPATCH);
export const DELETE = observeRoute("api.portal.destinatarios.delete", manejarDELETE);
