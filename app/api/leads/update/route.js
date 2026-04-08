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

    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) {
      return Response.json(
        { success: false, message: "Sin permisos para editar leads" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const {
      leadId,
      status,
      owner,
      notes,
      proxima_accion,
      ultima_accion,
      valor_estimado,
    } = body;

    if (!leadId) {
      return Response.json(
        { success: false, message: "Falta leadId" },
        { status: 400 }
      );
    }

    const changes = {
      ...(status !== undefined ? { status } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(proxima_accion !== undefined ? { proxima_accion } : {}),
      ...(ultima_accion !== undefined ? { ultima_accion } : {}),
      ...(valor_estimado !== undefined ? { valor_estimado } : {}),
    };

    const { data: updatedLead, error } = await ctx.supabase
      .from("leads")
      .update(changes)
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
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
      entity_type: "lead",
      entity_id: leadId,
      action: "updated",
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
      changes,
    });

    await ctx.supabase.from("lead_events").insert({
      lead_id: leadId,
      client_id: ctx.clientId,
      type: "lead_updated",
      title: "Lead actualizado desde el portal",
      description: "Se han modificado campos del lead desde el portal.",
      meta: changes,
    });

    return Response.json({ success: true, data: updatedLead });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error actualizando lead" },
      { status: 500 }
    );
  }
}