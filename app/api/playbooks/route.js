import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import {
  getDefaultPlaybookWorkspace,
  getPlaybookLibrary,
  parsePlaybookWorkspace,
  serializePlaybookWorkspace,
} from "@/lib/portal-product";

async function findIndustryPlaybook(industry = "") {
  const normalized = String(industry || "").trim().toLowerCase();
  if (!normalized) return null;

  const items = await prisma.industryPlaybook.findMany({ take: 50 });
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

export async function GET() {
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
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar la biblioteca de playbooks",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager"])) {
      return Response.json(
        { success: false, message: "Sin permisos para actualizar playbooks" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const workspace = body?.workspace || {};
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
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo guardar el playbook",
      },
      { status: 500 }
    );
  }
}
