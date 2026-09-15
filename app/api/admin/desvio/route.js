import { getAdminContext } from "@/lib/server/auth";
import { requireSameOrigin } from "@/lib/server/security";
import { estadoDelDesvio, desviar, quitarDesvio } from "@/lib/server/desvio";
import { observeRoute } from "@/lib/server/observability.mjs";

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
    return Response.json({ success: false, message: err?.message || "No se pudo leer" }, { status: 400 });
  }
}

async function manejarPOST(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });

  const body = await req.json().catch(() => ({}));
  const empresa = String(body?.empresa || "").trim();
  if (!empresa) return Response.json({ success: false, message: "Falta la empresa" }, { status: 400 });
  const actor = admin.userEmail || "admin";
  try {
    const resultado = body?.activar
      ? await desviar(empresa, { telefono: body?.telefono || null, actor })
      : await quitarDesvio(empresa, { actor });
    return Response.json({ success: true, data: resultado });
  } catch (err) {
    return Response.json({ success: false, message: err?.message || "No se pudo cambiar el desvío" }, { status: 400 });
  }
}

export const GET = observeRoute("api.admin.desvio.get", manejarGET);
export const POST = observeRoute("api.admin.desvio.post", manejarPOST);
