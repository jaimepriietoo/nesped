import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { paginar, cuantasFilas, respuestaPaginada, CursorInvalido } from "@/lib/server/paginacion";
import { reintentarEntrega } from "@/lib/server/webhooks-salientes";

/**
 * Las entregas del webhook saliente de la empresa: qué se mandó, cuándo,
 * qué contestó el destino, y un botón para volver a intentar lo que falló.
 * GET ?cursor&cuantos&estado= ; POST { entrega: id } para reintentar.
 */
async function manejarGET(req) {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado", data: [] }, { status: 401 });
  if (!puede(ctx.role, "api.test", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos", data: [] }, { status: 403 });

  const url = new URL(req.url);
  const estado = String(url.searchParams.get("estado") || "").trim();
  try {
    let consulta = ctx.datos.from("webhook_entregas")
      .select("id,evento,url,estado,intentos,codigo_http,ultimo_error,created_at,entregado_en");
    if (["pendiente", "entregado", "fallido", "muerto"].includes(estado)) consulta = consulta.eq("estado", estado);
    const pagina = await paginar(consulta, {
      cursor: url.searchParams.get("cursor"),
      cuantos: cuantasFilas(url.searchParams.get("cuantos"), { porDefecto: 50 }),
    });
    return respuestaPaginada(pagina);
  } catch (err) {
    if (err instanceof CursorInvalido) return Response.json({ success: false, message: err.message, data: [] }, { status: 400 });
    console.error("[portal/webhook/entregas]", err?.message || err);
    return Response.json({ success: false, message: "No se pudieron cargar las entregas", data: [] }, { status: 500 });
  }
}

async function manejarPOST(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "api.test", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body?.entrega || "").trim();
  if (!id) return Response.json({ success: false, message: "Falta la entrega" }, { status: 400 });
  try {
    const resultado = await reintentarEntrega(id, ctx.clientId);
    return Response.json({ success: true, ...resultado });
  } catch (err) {
    return Response.json({ success: false, message: err?.message || "No se pudo reintentar" }, { status: 400 });
  }
}

export const GET = observeRoute("api.portal.webhook.entregas.get", manejarGET);
export const POST = observeRoute("api.portal.webhook.entregas.post", manejarPOST);
