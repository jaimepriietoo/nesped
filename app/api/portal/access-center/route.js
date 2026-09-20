import { getPortalContext } from "@/lib/portal-auth";
import { filasDePermisos } from "@/lib/server/datos";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { buildAccessCenterData } from "@/lib/server/portal-phase-three";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }
    if (!puede(ctx.role, "users.manage", ctx.permissions)) return sinPermiso();

    const [portalUsersRes, authUsersRes, auditRes] = await Promise.all([
      ctx.supabase
        .from("portal_users")
        .select("id,client_id,full_name,email,role,phone,is_active,created_at,permissions,updated_at")
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

    const permissionRows = filasDePermisos(portalUsersRes.data || []);
    /* Ningún constructor ni respuesta recibe hashes. Esta ruta sólo necesita
       saber si existe una credencial para pintar el estado de la cuenta. */
    const authUsers = (authUsersRes.data || []).map((user) => ({
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      hasPassword: Boolean(user.password || user.password_hash),
    }));

    return Response.json({
      success: true,
      data: buildAccessCenterData({
        portalUsers: portalUsersRes.data || [],
        authUsers,
        auditLogs: auditRes.data || [],
        permissionRows,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.access_center_failed", error);
    return Response.json(
      {
        success: false,
        message: "No se pudo cargar Access Center",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.access-center.get", manejarGET);
