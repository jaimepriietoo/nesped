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
      .from("lead_comments")
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
      { success: false, message: error.message || "Error cargando comentarios", data: [] },
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
        { success: false, message: "Sin permisos para comentar" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { lead_id, body: commentBody } = body;

    if (!lead_id || !commentBody) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from("lead_comments")
      .insert({
        lead_id,
        client_id: ctx.clientId,
        author: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
        body: commentBody,
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
      type: "comment_added",
      title: "Comentario interno añadido",
      description: commentBody,
      meta: { author: ctx.currentUser?.full_name || ctx.userEmail || "portal_user" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando comentario" },
      { status: 500 }
    );
  }
}