import { getPortalContext } from "@/lib/portal-auth";
import { paginar, cuantasFilas, respuestaPaginada, CursorInvalido } from "@/lib/server/paginacion";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

/**
 * Los contactos de la empresa, por cursor.
 *
 * /api/portal/overview trae los 500 más recientes para entrar rápido; esto
 * es para seguir a partir de ahí: ?cursor=<el que devolvió la página
 * anterior>&cuantos=100. Sin cursor, empieza por el principio.
 */
async function manejarGET(req) {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado", data: [] }, { status: 401 });

  const url = new URL(req.url);
  try {
    const pagina = await paginar(
      ctx.datos.from("leads").select("*"),
      { cursor: url.searchParams.get("cursor"), cuantos: cuantasFilas(url.searchParams.get("cuantos")) },
    );
    return respuestaPaginada(pagina);
  } catch (err) {
    if (err instanceof CursorInvalido) return Response.json({ success: false, message: err.message, data: [] }, { status: 400 });
    logErrorSeguro("portal.contacts_load_failed", err);
    return Response.json({ success: false, message: "No se pudieron cargar los contactos", data: [] }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.contactos.get", manejarGET);
