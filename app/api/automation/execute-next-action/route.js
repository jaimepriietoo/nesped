import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { executeNextBestAction } from "@/lib/server/next-best-action-service";

export async function POST(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) {
      return Response.json(
        { success: false, message: "Sin permisos para ejecutar la acción" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const result = await executeNextBestAction({
      supabase: ctx.supabase,
      leadId: body?.leadId,
      clientId: ctx.clientId,
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
    });

    return Response.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error("POST /api/automation/execute-next-action error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error ejecutando la acción recomendada",
      },
      { status: 500 }
    );
  }
}
