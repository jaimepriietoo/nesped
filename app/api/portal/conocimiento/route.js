import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { validar } from "@/lib/server/esquemas";
import { GestionConocimiento } from "@/lib/server/esquemas-portal";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import {
  anadirConocimiento, conocimientoVigente, guardarPinRuperta, quitarPinRuperta, retirarConocimiento, telefonosAutorizados, NOMBRE_ACTIVACION,
} from "@/lib/server/conocimiento";

/**
 * Lo que la IA debe saber ahora (leer, añadir, retirar) y el PIN del modo
 * Ruperta. Leer, cualquiera con acceso a la IA; escribir, quien configura la
 * IA (owner y admin).
 */
async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    const [lista, autorizados, { data: ajustes }] = await Promise.all([
      conocimientoVigente(ctx.clientId, ctx.supabase),
      telefonosAutorizados(ctx.clientId),
      ctx.supabase.from("client_settings").select("ruperta_pin_hash").eq("client_id", ctx.clientId).maybeSingle(),
    ]);
    return Response.json({
      success: true,
      conocimiento: lista,
      ruperta: {
        nombre: NOMBRE_ACTIVACION,
        pinConfigurado: Boolean(ajustes?.ruperta_pin_hash),
        telefonos: autorizados.map((a) => ({ telefono: a.telefono.replace(/(\d{3})\d+(\d{2})$/, "$1···$2"), email: a.email, role: a.role })),
      },
      puedeEditar: puede(ctx.role, "ai.configure", ctx.permissions),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.conocimiento_list_failed", error);
    return Response.json({ success: false, message: "No se pudo leer" }, { status: 500 });
  }
}

async function manejarPOST(req) {
  try {
    const origen = requireSameOrigin(req);
    if (origen) return origen;
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!puede(ctx.role, "ai.configure", ctx.permissions)) return sinPermiso("Sólo el propietario o un administrador pueden cambiar lo que sabe la IA.");
    const limite = await requireRateLimitAsync(req, {
      namespace: "portal:conocimiento", limit: 60, keyParts: [ctx.clientId, ctx.userEmail], includeIp: false,
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(GestionConocimiento, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const { datos } = entrada;

    const auditar = (action, changes) => ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId, entity_type: "conocimiento", entity_id: changes.id || ctx.clientId, action, actor: ctx.userEmail, changes,
    });

    if (datos.action === "add") {
      const fila = await anadirConocimiento({
        clientId: ctx.clientId, texto: datos.texto, autor: ctx.userEmail, origen: "portal",
        vigenteHasta: datos.vigente_hasta ? new Date(datos.vigente_hasta).toISOString() : null, supabase: ctx.supabase,
      });
      await auditar("conocimiento_anadido", { id: fila.id, vigente_hasta: fila.vigente_hasta });
      return Response.json({ success: true, fila });
    }
    if (datos.action === "remove") {
      const ok = await retirarConocimiento({ clientId: ctx.clientId, id: datos.id, supabase: ctx.supabase });
      if (!ok) return Response.json({ success: false, message: "Eso ya no está" }, { status: 404 });
      await auditar("conocimiento_retirado", { id: datos.id });
      return Response.json({ success: true });
    }
    if (datos.action === "pin") {
      await guardarPinRuperta({ clientId: ctx.clientId, pin: datos.pin, supabase: ctx.supabase });
      await auditar("ruperta_pin_cambiado", {});
      return Response.json({ success: true });
    }
    await quitarPinRuperta({ clientId: ctx.clientId, supabase: ctx.supabase });
    await auditar("ruperta_pin_quitado", {});
    return Response.json({ success: true });
  } catch (error) {
    logErrorSeguro("portal.conocimiento_update_failed", error);
    return Response.json({ success: false, message: "No se pudo guardar" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.conocimiento.get", manejarGET);
export const POST = observeRoute("api.portal.conocimiento.post", manejarPOST);
