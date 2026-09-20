import { getAdminContext } from "@/lib/server/auth";
import { validar } from "@/lib/server/esquemas";
import { DesvioAdmin } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { estadoDelDesvio, desviar, quitarDesvio } from "@/lib/server/desvio";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

/**
 * El botón de desviar el número de una empresa a su teléfono.
 * GET ?empresa= → estado. POST { empresa, activar: true|false, telefono? }.
 * Para cuando ElevenLabs se cae: ver docs/cuando-se-cae-algo.md.
 */
async function manejarGET(req) {
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });
  const empresa = String(new URL(req.url).searchParams.get("empresa") || "").trim();
  if (!empresa) return Response.json({ success: false, message: "Falta la empresa" }, { status: 400 });
  try {
    return Response.json({ success: true, data: await estadoDelDesvio(empresa) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logErrorSeguro("admin.desvio_read_failed", err);
    return Response.json({ success: false, message: "No se pudo leer el desvío" }, { status: 400 });
  }
}

async function manejarPOST(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });

  const limite = await requireRateLimitAsync(req, {
    namespace: "admin-desvio",
    limit: 20,
    keyParts: [admin.userEmail || "admin"],
  });
  if (limite) return limite;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const entrada = validar(DesvioAdmin, cuerpo.datos);
  if (entrada.respuesta) return entrada.respuesta;
  const body = entrada.datos;
  const empresa = body.empresa;
  const actor = admin.userEmail || "admin";
  try {
    const resultado = body?.activar
      ? await desviar(empresa, { telefono: body?.telefono || null, actor })
      : await quitarDesvio(empresa, { actor });
    return Response.json({ success: true, data: resultado });
  } catch (err) {
    logErrorSeguro("admin.desvio_update_failed", err, { client_id: empresa });
    return Response.json({ success: false, message: "No se pudo cambiar el desvío" }, { status: 400 });
  }
}

export const GET = observeRoute("api.admin.desvio.get", manejarGET);
export const POST = observeRoute("api.admin.desvio.post", manejarPOST);
