import { getPortalContext } from "@/lib/portal-auth";
import { observeRoute } from "@/lib/server/observability.mjs";
import { paginar, cuantasFilas, respuestaPaginada, CursorInvalido } from "@/lib/server/paginacion";

/**
 * Los eventos de un contacto, por cursor.
 *
 * La ficha enseña los 50 últimos mezclados con llamadas y auditoría; esto
 * es para leer el historial entero de un contacto con mucha vida:
 * ?lead_id=…&cursor=…&cuantos=100. Sin lead_id, los de toda la empresa.
 */
async function manejarGET(req) {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado", data: [] }, { status: 401 });

  const url = new URL(req.url);
  const leadId = String(url.searchParams.get("lead_id") || "").trim();
  try {
    let consulta = ctx.datos.from("lead_events").select("id,lead_id,type,title,description,created_at");
    if (leadId) consulta = consulta.eq("lead_id", leadId);
    const pagina = await paginar(consulta, {
      cursor: url.searchParams.get("cursor"),
      cuantos: cuantasFilas(url.searchParams.get("cuantos")),
    });
    return respuestaPaginada(pagina);
  } catch (err) {
    if (err instanceof CursorInvalido) return Response.json({ success: false, message: err.message, data: [] }, { status: 400 });
    console.error("[portal/eventos]", err?.message || err);
    return Response.json({ success: false, message: "No se pudieron cargar los eventos", data: [] }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.eventos.get", manejarGET);
