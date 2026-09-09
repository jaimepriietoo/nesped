import { getPortalContext } from "@/lib/portal-auth";
import { direccionParaEscuchar } from "@/lib/server/grabaciones";

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
export async function GET(req) {
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
    const url = await direccionParaEscuchar(llamada.grabacion_propia);
    return Response.json({ success: true, url });
  } catch {
    return Response.json({ success: false, message: "No se pudo preparar la grabación" }, { status: 500 });
  }
}
