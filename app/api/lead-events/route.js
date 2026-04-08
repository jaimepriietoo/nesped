import { getPortalContext } from "@/lib/portal-auth";

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
      .from("lead_events")
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
      { success: false, message: error.message || "Error cargando eventos", data: [] },
      { status: 500 }
    );
  }
}