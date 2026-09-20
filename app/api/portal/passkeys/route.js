import { getPortalContext } from "@/lib/portal-auth";
import { consumirCodigo } from "@/lib/server/codigos-recuperacion";
import { validar } from "@/lib/server/esquemas";
import { GestionPasskeys } from "@/lib/server/esquemas-portal";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import {
  completarRegistro,
  eliminarPasskey,
  listarPasskeys,
  opcionesDeRegistro,
  passkeyObligatoriaDesde,
} from "@/lib/server/passkeys";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { estadoTotp, verificarYConsumirTotp } from "@/lib/server/totp";
import { rolEstricto } from "@/lib/server/sesiones";

/**
 * Las passkeys de la propia cuenta: ver, añadir y quitar.
 *
 * Añadir una no exige nada más que la sesión (ya lleva huella e
 * inactividad). Quitar una sí: si hay TOTP, su código o uno de recuperación,
 * para que un intruso con la sesión abierta no pueda quitar el factor que
 * le cerraría la puerta la próxima vez.
 */
async function registrar(ctx, action, changes = {}) {
  const { error } = await ctx.supabase.from("audit_logs").insert({
    client_id: ctx.clientId, entity_type: "auth", entity_id: ctx.currentUser?.id || "self",
    action, actor: ctx.userEmail, changes,
  });
  if (error) logErrorSeguro("portal.passkeys_audit_failed", error);
}

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    const passkeys = await listarPasskeys({ email: ctx.userEmail, clientId: ctx.clientId });
    const desde = passkeyObligatoriaDesde();
    return Response.json({
      success: true,
      passkeys,
      obligatoria: Boolean(desde && rolEstricto(ctx.role)),
      obligatoriaDesde: desde ? desde.toISOString() : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.passkeys_list_failed", error);
    return Response.json({ success: false, message: "No se pudieron leer las passkeys" }, { status: 500 });
  }
}

async function manejarPOST(req) {
  try {
    const origen = requireSameOrigin(req);
    if (origen) return origen;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    const limite = await requireRateLimitAsync(req, {
      namespace: "portal-passkeys", limit: 15, windowMs: 15 * 60 * 1000, keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(GestionPasskeys, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const { datos } = entrada;

    if (datos.action === "start") {
      const opciones = await opcionesDeRegistro({ email: ctx.userEmail, clientId: ctx.clientId });
      return Response.json({ success: true, opciones }, { headers: { "Cache-Control": "no-store" } });
    }

    if (datos.action === "finish") {
      const resultado = await completarRegistro({
        email: ctx.userEmail, clientId: ctx.clientId, respuesta: datos.response, nombre: datos.nombre,
      });
      if (!resultado.ok) return Response.json({ success: false, message: resultado.motivo }, { status: 400 });
      await registrar(ctx, "passkey_added", { id: resultado.id });
      return Response.json({ success: true, id: resultado.id });
    }

    const totp = await estadoTotp({ email: ctx.userEmail, clientId: ctx.clientId });
    if (totp.enabled) {
      const code = datos.code || "";
      const valido = /^\d{6}$/.test(code)
        ? await verificarYConsumirTotp({ email: ctx.userEmail, clientId: ctx.clientId, codigo: code })
        : code ? await consumirCodigo({ email: ctx.userEmail, codigo: code }) : false;
      if (!valido) return Response.json({ success: false, message: "Para quitar una passkey hace falta el código de tu aplicación autenticadora" }, { status: 401 });
    }
    const eliminada = await eliminarPasskey({ id: datos.id, email: ctx.userEmail, clientId: ctx.clientId });
    if (!eliminada) return Response.json({ success: false, message: "Esa passkey no existe" }, { status: 404 });
    await registrar(ctx, "passkey_removed", { id: datos.id });
    return Response.json({ success: true });
  } catch (error) {
    logErrorSeguro("portal.passkeys_update_failed", error);
    return Response.json({ success: false, message: "No se pudo actualizar la passkey" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.passkeys.get", manejarGET);
export const POST = observeRoute("api.portal.passkeys.post", manejarPOST);
