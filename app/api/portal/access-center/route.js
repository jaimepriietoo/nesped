import { getPortalContext } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { buildAccessCenterData } from "@/lib/server/portal-phase-three";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [portalUsersRes, authUsersRes, auditRes] = await Promise.all([
      ctx.supabase
        .from("portal_users")
        .select("id,client_id,full_name,email,role,phone,is_active,created_at")
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: true }),
      ctx.supabase
        .from("users")
        .select("email,role,created_at,password,password_hash")
        .eq("client_id", ctx.clientId),
      ctx.supabase
        .from("audit_logs")
        .select("*")
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const errors = [
      portalUsersRes.error,
      authUsersRes.error,
      auditRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Access Center");
    }

    const userIds = (portalUsersRes.data || []).map((user) => user.id).filter(Boolean);
    const permissionRows =
      userIds.length > 0
        ? await prisma.userPermission.findMany({
            where: { user_id: { in: userIds } },
            orderBy: { created_at: "desc" },
          })
        : [];

    return Response.json({
      success: true,
      data: buildAccessCenterData({
        portalUsers: portalUsersRes.data || [],
        authUsers: authUsersRes.data || [],
        auditLogs: auditRes.data || [],
        permissionRows,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Access Center",
      },
      { status: 500 }
    );
  }
}
