import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { paginar, cuantasFilas, respuestaPaginada, CursorInvalido } from "@/lib/server/paginacion";

/**
 * El registro de auditoría de la empresa, por cursor. Para leerlo entero
 * sin la exportación de 2000 filas: quien puede exportar, puede leer.
 */
export async function GET(req) {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado", data: [] }, { status: 401 });
  if (!puede(ctx.role, "audit.export")) return Response.json({ success: false, message: "Sin permisos", data: [] }, { status: 403 });

  const url = new URL(req.url);
  try {
    const pagina = await paginar(
      ctx.datos.from("audit_logs").select("id,actor_email,action,entity,entity_id,changes,created_at"),
      { cursor: url.searchParams.get("cursor"), cuantos: cuantasFilas(url.searchParams.get("cuantos")) },
    );
    return respuestaPaginada(pagina);
  } catch (err) {
    if (err instanceof CursorInvalido) return Response.json({ success: false, message: err.message, data: [] }, { status: 400 });
    console.error("[portal/auditoria]", err?.message || err);
    return Response.json({ success: false, message: "No se pudo cargar la auditoría", data: [] }, { status: 500 });
  }
}
