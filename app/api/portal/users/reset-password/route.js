import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { hashPassword } from "@/lib/server/auth";
import { requireSameOrigin } from "@/lib/server/security";

export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para resetear contraseña"
    );
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
        { success: false, message: "Sin permisos para resetear contraseñas" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    const password = String(body?.password || "").trim();

    if (!userId || password.length < 8) {
      return Response.json(
        {
          success: false,
          message: "Indica usuario y una contraseña de al menos 8 caracteres",
        },
        { status: 400 }
      );
    }

    const { data: portalUser, error } = await ctx.supabase
      .from("portal_users")
      .select("id,email,role")
      .eq("id", userId)
      .eq("client_id", ctx.clientId)
      .single();

    if (error || !portalUser) {
      return Response.json(
        { success: false, message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    await ctx.supabase.from("users").upsert(
      {
        email: String(portalUser.email || "").trim().toLowerCase(),
        role: portalUser.role || "agent",
        client_id: ctx.clientId,
        password: hashPassword(password),
      },
      { onConflict: "email" }
    );

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "portal_user",
      entity_id: portalUser.id,
      action: "portal_user_password_reset",
      actor: ctx.userEmail,
      changes: JSON.stringify({
        email: portalUser.email,
      }),
      created_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo resetear la contraseña",
      },
      { status: 500 }
    );
  }
}

