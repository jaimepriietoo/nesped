import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { validarPassword } from "@/lib/server/passwords";
import { hashPassword, revocarSesionesDe } from "@/lib/server/auth";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para resetear contraseña"
    );
    if (sameOriginError) return sameOriginError;

    // Aunque haga falta rol elevado, un límite corta el ruido y evita que
    // una sesión robada haga daño en masa antes de que nadie se entere.
    const limiteError = await requireRateLimitAsync(req, {
      namespace: "portal:reset-password",
      limit: 10,
      windowMs: 15 * 60 * 1000,
      message: "Demasiados cambios de contraseña seguidos. Espera unos minutos.",
    });
    if (limiteError) return limiteError;

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

    if (!userId) {
      return Response.json(
        { success: false, message: "Indica de qué usuario se trata" },
        { status: 400 }
      );
    }

    // Misma exigencia en todo el producto: la regla vive en un solo sitio.
    const política = validarPassword(password);
    if (!política.ok) {
      return Response.json({ success: false, message: política.message }, { status: 400 });
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

    /*
     * Cambiar la contraseña echa a quien estuviera dentro.
     *
     * Es lo primero que hace alguien que sospecha que le han entrado, y hasta
     * ahora no servía de nada: la sesión del intruso seguía siendo válida
     * siete días más. Subir la generación de sesión la invalida al instante.
     */
    await revocarSesionesDe(portalUser.email);

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

