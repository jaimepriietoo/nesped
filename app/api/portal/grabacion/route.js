import { getPortalContext } from "@/lib/portal-auth";
import { direccionParaEscuchar } from "@/lib/server/grabaciones";
import { observeRoute } from "@/lib/server/observability.mjs";

/**
 * Escuchar la grabación de una llamada.
 *
 * Antes el portal pintaba <audio src={recording_url}> con la dirección del
 * proveedor. El navegador iba directo allí, sin pasar por Nesped, así que para
 * que sonara la dirección tenía que abrirse sin credenciales: cualquiera que
 * consiguiera una escuchaba la conversación de un cliente ajeno, fuera de qué
 * empresa fuera.
 *
 * Ahora hay una puerta. Se comprueba la sesión, se comprueba que la llamada es
 * de SU empresa, y sólo entonces se firma una dirección que caduca en diez
 * minutos.
 *
 * El filtro por empresa es el motivo de que esta ruta exista. Sin él sería el
 * mismo agujero con más pasos.
 */
async function manejarGET(req) {
  const ctx = await getPortalContext();
  if (!ctx.ok) {
    return Response.json({ success: false, message: ctx.message }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json({ success: false, message: "Falta la llamada" }, { status: 400 });
  }

  const { data: llamada, error } = await ctx.supabase
    .from("calls")
    .select("id,grabacion_propia")
    .eq("id", id)
    .eq("client_id", ctx.clientId)
    .maybeSingle();

  if (error) {
    return Response.json({ success: false, message: "No se pudo leer la llamada" }, { status: 500 });
  }

  /* Una llamada de otra empresa y una llamada que no existe contestan lo
     mismo. Distinguirlas diría a quien prueba identificadores cuáles existen. */
  if (!llamada?.grabacion_propia) {
    return Response.json({ success: false, message: "No hay grabación" }, { status: 404 });
  }

  try {
    const { error: auditError } = await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId, entity_type: "call", entity_id: String(llamada.id),
      action: "recording_access", actor: ctx.userEmail,
    });
    if (auditError) throw new Error("No se pudo registrar el acceso");
    const url = await direccionParaEscuchar(llamada.grabacion_propia);
    return Response.json({ success: true, url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ success: false, message: "No se pudo preparar la grabación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.grabacion.get", manejarGET);
