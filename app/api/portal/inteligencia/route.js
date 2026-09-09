import { getPortalContext } from "@/lib/portal-auth";
import { evaluarInteligencia } from "@/lib/server/inteligencia";

/**
 * Estado de inteligencia de la cuenta: qué se puede afirmar y qué falta.
 *
 * Todo se calcula con el cliente de Supabase del contexto y filtrando por el
 * client_id de la sesión, así que no hay forma de pedir los datos de otra
 * empresa cambiando un parámetro: no se acepta ninguno.
 */
export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const datos = await evaluarInteligencia({
      supabase: ctx.supabase,
      clientId: ctx.clientId,
    });

    return Response.json({ success: true, ...datos });
  } catch (error) {
    console.error("GET /api/portal/inteligencia error:", error);
    return Response.json(
      { success: false, message: "No se pudo evaluar el estado de los datos" },
      { status: 500 }
    );
  }
}
