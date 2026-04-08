import { getPortalContext, hasRole } from "@/lib/portal-auth";

export async function PATCH(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin"])) {
      return Response.json(
        { success: false, message: "Sin permisos para editar branding" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      brand_name,
      brand_logo_url,
      primary_color,
      secondary_color,
      owner_email,
      industry,
    } = body;

    const { data, error } = await ctx.supabase
      .from("clients")
      .update({
        brand_name,
        brand_logo_url,
        primary_color,
        secondary_color,
        owner_email,
        industry,
      })
      .eq("id", ctx.clientId)
      .select()
      .single();

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "client",
      entity_id: ctx.clientId,
      action: "branding_updated",
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
      changes: body,
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error actualizando branding" },
      { status: 500 }
    );
  }
}