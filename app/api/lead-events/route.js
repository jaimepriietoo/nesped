import { getPortalContext } from "@/lib/portal-auth";
import { exigirContactoPropio } from "@/lib/server/pertenencia";

/**
 * Historial de eventos de un contacto.
 *
 * Esta ruta filtraba por el `lead_id` que llegaba en la URL y por nada más.
 * Pedía sesión, sí, pero no comprobaba que ese contacto fuera de tu empresa:
 * con una cuenta recién creada se leían los eventos de cualquier otro
 * cliente. Comprobado, no supuesto: 6 eventos ajenos devueltos.
 *
 * Es el fallo típico de multi-cliente. "Está autenticado" y "tiene derecho a
 * ESTE dato" son dos preguntas distintas, y la segunda se olvida porque la
 * primera ya da la sensación de haber cerrado la puerta.
 *
 * También aceptaba un parámetro `phone`, que además de saltarse la empresa
 * habría permitido barrer números de teléfono y sacar el historial de una
 * persona en TODAS las empresas del sistema. Se ha quitado: la tabla ni
 * siquiera tiene esa columna, así que esa rama sólo podía dar un error.
 */
export async function GET(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json({ success: false, message: ctx.message }, { status: 401 });
    }

    const leadId = new URL(req.url).searchParams.get("lead_id");

    /* Mismo guardián que en notas, comentarios y recordatorios. Se comprueba
       la pertenencia y DESPUÉS se lee, para que "no es tuyo" y "no tiene
       eventos todavía" no se confundan en la misma respuesta vacía. */
    const ajeno = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId });
    if (ajeno) return ajeno;

    const { data, error } = await ctx.supabase
      .from("lead_events")
      .select("*")
      /* Las dos condiciones juntas. El client_id sale de la sesión, nunca de
         la petición, así que no hay parámetro que tocar para cambiarlo. */
      .eq("client_id", ctx.clientId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw new Error(error.message);

    return Response.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("GET /api/lead-events error:", error);
    return Response.json(
      { success: false, message: "No se pudo leer el historial" },
      { status: 500 }
    );
  }
}
