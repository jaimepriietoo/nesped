import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { paginar, cuantasFilas, respuestaPaginada, CursorInvalido } from "@/lib/server/paginacion";
import { reintentarEntrega } from "@/lib/server/webhooks-salientes";
import { validar } from "@/lib/server/esquemas";
import { ReintentarEntregaWebhook } from "@/lib/server/esquemas-portal";

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
    logErrorSeguro("portal.webhook_deliveries_read_failed", err);
    return Response.json({ success: false, message: "No se pudieron cargar las entregas", data: [] }, { status: 500 });
  }
}

async function manejarPOST(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "api.test", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });

  const limited = await requireRateLimitAsync(req, {
    namespace: "portal:webhook-retry",
    limit: 10,
    keyParts: [ctx.clientId, ctx.userEmail],
    includeIp: false,
  });
  if (limited) return limited;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(ReintentarEntregaWebhook, cuerpo.datos);
  if (leido.respuesta) return leido.respuesta;
  const id = leido.datos.entrega;
  try {
    const resultado = await reintentarEntrega(id, ctx.clientId);
    return Response.json({ success: true, ...resultado });
  } catch (err) {
    return Response.json({ success: false, message: err?.message || "No se pudo reintentar" }, { status: 400 });
  }
}

export const GET = observeRoute("api.portal.webhook.entregas.get", manejarGET);
export const POST = observeRoute("api.portal.webhook.entregas.post", manejarPOST);
