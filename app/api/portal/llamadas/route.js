import { getPortalContext } from "@/lib/portal-auth";
import { paginar, cuantasFilas, respuestaPaginada, CursorInvalido } from "@/lib/server/paginacion";

/**
 * Las llamadas de la empresa, por cursor. Misma forma que /api/calls (sin
 * la URL de grabación: ésa se pide aparte y firmada), pero sin fin.
 */
export async function GET(req) {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado", data: [] }, { status: 401 });

  const url = new URL(req.url);
  try {
    const pagina = await paginar(
      ctx.datos.from("calls").select("*"),
      { cursor: url.searchParams.get("cursor"), cuantos: cuantasFilas(url.searchParams.get("cuantos")) },
    );
    pagina.filas = pagina.filas.map(({ recording_url, grabacion_propia, ...llamada }) => ({
      ...llamada,
      tiene_grabacion: Boolean(grabacion_propia),
    }));
    return respuestaPaginada(pagina);
  } catch (err) {
    if (err instanceof CursorInvalido) return Response.json({ success: false, message: err.message, data: [] }, { status: 400 });
    console.error("[portal/llamadas]", err?.message || err);
    return Response.json({ success: false, message: "No se pudieron cargar las llamadas", data: [] }, { status: 500 });
  }
}
