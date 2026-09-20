import { validar } from "@/lib/server/esquemas";
import { GuardarPlaybook } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { playbooksPorSector } from "@/lib/server/datos";
import {
  getDefaultPlaybookWorkspace,
  getPlaybookLibrary,
  parsePlaybookWorkspace,
  serializePlaybookWorkspace,
} from "@/lib/portal-product";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function findIndustryPlaybook(industry = "") {
  const normalized = String(industry || "").trim().toLowerCase();
  if (!normalized) return null;

  const items = await playbooksPorSector({ cuantos: 50 });
  return (
    items.find(
      (item) => String(item.industry || "").trim().toLowerCase() === normalized
    ) || null
  );
}

function mergeWorkspaceWithIndustry(defaults, industryPlaybook) {
  if (!industryPlaybook) return defaults;

  return {
    ...defaults,
    tone: industryPlaybook.tone || defaults.tone,
    objections: industryPlaybook.objections || defaults.objections,
    notes: industryPlaybook.system_prompt || defaults.notes,
  };
}

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    const { data: client, error } = await ctx.supabase
      .from("clients")
      .select("id,name,brand_name,industry,prompt")
      .eq("id", ctx.clientId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const industryPlaybook = await findIndustryPlaybook(client?.industry);
    const defaults = mergeWorkspaceWithIndustry(
      getDefaultPlaybookWorkspace({
        industry: client?.industry,
        brandName: client?.brand_name || client?.name || "Nesped",
      }),
      industryPlaybook
    );

    const workspace = parsePlaybookWorkspace(client?.prompt || "", defaults);

    return Response.json({
      success: true,
      data: {
        workspace,
        library: getPlaybookLibrary({
          industry: client?.industry,
          brandName: client?.brand_name || client?.name || "Nesped",
        }),
        defaults,
        industryPlaybook: industryPlaybook
          ? {
              industry: industryPlaybook.industry,
              tone: industryPlaybook.tone || "",
              objections: industryPlaybook.objections || "",
              systemPrompt: industryPlaybook.system_prompt || "",
            }
          : null,
      },
    });
  } catch (error) {
    logErrorSeguro("playbooks.read_failed", error);
    return Response.json(
      {
        success: false,
        message: "No se pudo cargar la biblioteca de playbooks",
      },
      { status: 500 }
    );
  }
}

async function manejarPATCH(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "playbooks.manage", ctx.permissions)) {
      return Response.json(
        { success: false, message: "Sin permisos para actualizar playbooks" },
        { status: 403 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "playbooks-update", limit: 20, keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 96 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(GuardarPlaybook, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const workspace = entrada.datos.workspace;
    const prompt = serializePlaybookWorkspace(workspace);

    const { error } = await ctx.supabase
      .from("clients")
      .update({
        prompt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.clientId);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      success: true,
      message: "Playbook guardado correctamente",
      data: {
        workspace: {
          ...workspace,
          compiledPrompt: prompt,
        },
      },
    });
  } catch (error) {
    logErrorSeguro("playbooks.write_failed", error);
    return Response.json(
      {
        success: false,
        message: "No se pudo guardar el playbook",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.playbooks.get", manejarGET);
export const PATCH = observeRoute("api.playbooks.patch", manejarPATCH);
