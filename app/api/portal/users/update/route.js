import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";

export async function PATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para actualizar usuarios"
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
        { success: false, message: "Sin permisos para actualizar usuarios" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = String(body?.id || "").trim();
    const fullName = String(body?.full_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "agent").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const isActive = body?.is_active !== false;

    if (!id || !fullName || !email) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await ctx.supabase
      .from("portal_users")
      .select("*")
      .eq("id", id)
      .eq("client_id", ctx.clientId)
      .single();

    if (existingError || !existing) {
      return Response.json(
        { success: false, message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const { data: duplicate } = await ctx.supabase
      .from("portal_users")
      .select("id")
      .eq("client_id", ctx.clientId)
      .eq("email", email)
      .neq("id", id)
      .maybeSingle();

    if (duplicate) {
      return Response.json(
        { success: false, message: "Ya existe otro usuario con ese email" },
        { status: 400 }
      );
    }

    const updatePayload = {
      full_name: fullName,
      email,
      role,
      phone,
      is_active: isActive,
    };

    const { data: updated, error: updateError } = await ctx.supabase
      .from("portal_users")
      .update(updatePayload)
      .eq("id", id)
      .eq("client_id", ctx.clientId)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const oldEmail = String(existing.email || "").trim().toLowerCase();
    const { data: authUser } = await ctx.supabase
      .from("users")
      .select("email")
      .eq("client_id", ctx.clientId)
      .eq("email", oldEmail)
      .maybeSingle();

    if (authUser?.email) {
      await ctx.supabase
        .from("users")
        .update({
          email,
          role,
          client_id: ctx.clientId,
        })
        .eq("client_id", ctx.clientId)
        .eq("email", oldEmail);
    } else {
      await ctx.supabase.from("users").upsert(
        {
          email,
          role,
          client_id: ctx.clientId,
        },
        { onConflict: "email" }
      );
    }

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "portal_user",
      entity_id: id,
      action: "portal_user_updated",
      actor: ctx.userEmail,
      changes: JSON.stringify({
        before: {
          email: oldEmail,
          role: existing.role,
          is_active: existing.is_active !== false,
        },
        after: {
          email,
          role,
          is_active: isActive,
        },
      }),
      created_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: "Usuario actualizado correctamente",
      data: updated,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo actualizar el usuario",
      },
      { status: 500 }
    );
  }
}

