import { getPortalContext } from "@/lib/portal-auth";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { ConfigIA } from "@/lib/server/esquemas-portal";
import { configIA, guardarConfigIA, promptDeEmpresa, TONOS, AUTONOMIA, POR_DEFECTO } from "@/lib/server/ia-config";
import { estadoDeLaIA } from "@/lib/server/estado-ia";
import { departamentosDeEmpresa } from "@/lib/server/departamentos";

/** La configuración de la IA de la empresa, con su estado real. */
async function manejarGET() {
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  try {
    const [config, estado, { lista: departamentos }, { data: empresa }] = await Promise.all([
      configIA(ctx.clientId, ctx.datos),
      estadoDeLaIA(ctx.clientId),
      departamentosDeEmpresa(ctx.clientId, ctx.datos),
      ctx.datos.from("clients").select("brand_name, name, industry").maybeSingle(),
    ]);
    const nombre = empresa?.brand_name || empresa?.name || "";
    return Response.json({
      success: true,
      data: config,
      prompt: promptDeEmpresa(config, { empresa: nombre, sector: empresa?.industry || "", departamentos }),
      estado: { activa: estado.activa, motivo: estado.motivo, causas: estado.causas, funciones: estado.funciones },
      opciones: { tonos: TONOS, autonomia: AUTONOMIA, porDefecto: POR_DEFECTO },
      departamentos,
      empresa: nombre,
      puedeEditar: puede(ctx.role, "ai.configure", ctx.permissions),
    });
  } catch (err) {
    console.error("[portal/ia]", err?.message || err);
    return Response.json({ success: false, message: "No se pudo leer la configuración de la IA" }, { status: 500 });
  }
}

async function manejarPUT(req) {
  const origen = requireSameOrigin(req);
  if (origen) return origen;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "ai.configure", ctx.permissions)) return sinPermiso("Sólo el propietario o un administrador pueden configurar la IA.");
  const leido = validar(ConfigIA, await req.json().catch(() => ({})));
  if (leido.respuesta) return leido.respuesta;
  try {
    const config = await guardarConfigIA(ctx.clientId, leido.datos, ctx.datos);
    await ctx.datos.from("audit_logs").insert({ client_id: ctx.clientId, entity_type: "ia_config", entity_id: ctx.clientId, action: "ia_config_actualizada", actor: ctx.userEmail, changes: { tono: config.tono, autonomia: config.autonomia } });
    return Response.json({ success: true, data: config });
  } catch (err) {
    console.error("[portal/ia] PUT", err?.message || err);
    return Response.json({ success: false, message: "No se pudo guardar" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.ia.get", manejarGET);
export const PUT = observeRoute("api.portal.ia.put", manejarPUT);
