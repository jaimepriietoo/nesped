import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { leerJsonLimitado, requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { Previsualizar } from "@/lib/server/esquemas-portal";
import { configIA, previsualizar } from "@/lib/server/ia-config";
import { departamentosDeEmpresa } from "@/lib/server/departamentos";

/**
 * Cómo respondería la IA con una configuración (la guardada o la que se
 * está editando, sin guardar). Si la IA no está, lo dice y devuelve el
 * prompt, que es lo que sí se puede enseñar.
 */
async function manejarPOST(req) {
  const origen = requireSameOrigin(req);
  if (origen) return origen;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "ai.configure", ctx.permissions)) return sinPermiso();
  const limitado = await requireRateLimitAsync(req, { namespace: "ia:previsualizar", limit: 30, keyParts: [ctx.clientId], includeIp: false });
  if (limitado) return limitado;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(Previsualizar, cuerpo.datos);
  if (leido.respuesta) return leido.respuesta;
  try {
    const [guardada, { lista: departamentos }, { data: empresa }] = await Promise.all([
      configIA(ctx.clientId, ctx.datos),
      departamentosDeEmpresa(ctx.clientId, ctx.datos),
      ctx.datos.from("clients").select("brand_name, name, industry").maybeSingle(),
    ]);
    const r = await previsualizar({
      clientId: ctx.clientId,
      config: leido.datos.config ? { ...guardada, ...leido.datos.config } : guardada,
      mensaje: leido.datos.mensaje,
      empresa: empresa?.brand_name || empresa?.name || "",
      sector: empresa?.industry || "",
      departamentos,
    });
    return Response.json({ success: true, ...r });
  } catch (err) {
    logErrorSeguro("portal.ia_preview_failed", err);
    return Response.json({ success: false, message: "No se pudo previsualizar" }, { status: 500 });
  }
}

export const POST = observeRoute("api.portal.ia.previsualizar.post", manejarPOST);
