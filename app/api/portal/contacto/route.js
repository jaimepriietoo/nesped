import { getPortalContext } from "@/lib/portal-auth";
import { fichaDeContacto } from "@/lib/server/contacto";

/**
 * Todo lo que se sabe de un contacto, en una sola llamada.
 *
 * La ficha necesitaba cuatro cosas de sitios distintos —el contacto, su
 * recorrido, su historial de compras y la acción recomendada— y pedirlas por
 * separado hacía que el panel se montara a trozos delante de quien lo abre.
 *
 * El identificador va por query y siempre se filtra además por el client_id
 * de la sesión: con el id de un contacto de otra empresa, esto devuelve 404,
 * no sus datos.
 */
export async function GET(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) {
      return Response.json({ success: false, message: "Falta el contacto" }, { status: 400 });
    }

    const ficha = await fichaDeContacto({
      supabase: ctx.supabase,
      clientId: ctx.clientId,
      leadId: id,
    });

    if (!ficha) {
      return Response.json({ success: false, message: "No encontrado" }, { status: 404 });
    }

    return Response.json({ success: true, ...ficha });
  } catch (error) {
    console.error("GET /api/portal/contacto error:", error);
    return Response.json(
      { success: false, message: "No se pudo leer la ficha" },
      { status: 500 }
    );
  }
}
