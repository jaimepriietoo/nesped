import { prisma } from "@/lib/prisma";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";
import {
  buildPermissionMatrix,
  getPermissionCatalog,
} from "@/lib/server/portal-permissions";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const { data: portalUsers, error } = await ctx.supabase
      .from("portal_users")
      .select("id,email,role")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "No se pudieron cargar permisos");
    }

    const userIds = (portalUsers || []).map((item) => item.id).filter(Boolean);
    const permissionRows =
      userIds.length > 0
        ? await prisma.userPermission.findMany({
            where: { user_id: { in: userIds } },
            orderBy: { created_at: "desc" },
          })
        : [];

    return Response.json({
      success: true,
      data: buildPermissionMatrix({
        users: portalUsers || [],
        permissionRows,
      }),
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "No se pudieron cargar permisos" },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin"])) {
      return Response.json(
        { success: false, message: "Sin permisos para editar permisos finos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    const scopes = Array.isArray(body?.scopes) ? body.scopes.map((item) => String(item || "").trim()) : [];

    if (!userId) {
      return Response.json(
        { success: false, message: "Falta userId" },
        { status: 400 }
      );
    }

    const allowedScopes = new Set(getPermissionCatalog().map((item) => item.id));
    const safeScopes = scopes.filter((scope) => allowedScopes.has(scope));

    await prisma.userPermission.deleteMany({
      where: { user_id: userId },
    });

    if (safeScopes.length > 0) {
      await prisma.userPermission.createMany({
        data: safeScopes.map((scope) => ({
          user_id: userId,
          scope,
        })),
      });
    }

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "permission",
      entity_id: userId,
      action: "permissions_updated",
      actor: ctx.userEmail,
      changes: { scopes: safeScopes },
      created_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: "Permisos finos actualizados",
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "No se pudieron guardar los permisos" },
      { status: 500 }
    );
  }
}
