import { getPortalContext, hasRole } from "@/lib/portal-auth";

export async function GET(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message, data: [] },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");

    if (!leadId) {
      return Response.json(
        { success: false, message: "Falta lead_id", data: [] },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json(
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    return Response.json({ success: true, data: data || [] });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando notas", data: [] },
      { status: 500 }
    );
  }
}

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
        { success: false, message: "Sin permisos para crear notas" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { lead_id, body: noteBody } = body;

    if (!lead_id || !noteBody) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from("lead_notes")
      .insert({
        lead_id,
        client_id: ctx.clientId,
        author: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
        body: noteBody,
      })
      .select()
      .single();

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    await ctx.supabase.from("lead_events").insert({
      lead_id,
      client_id: ctx.clientId,
      type: "note_added",
      title: "Nota interna añadida",
      description: noteBody,
      meta: { author: ctx.currentUser?.full_name || ctx.userEmail || "portal_user" },
    });

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: lead_id,
      action: "note_added",
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
      changes: { note: noteBody },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando nota" },
      { status: 500 }
    );
  }
}