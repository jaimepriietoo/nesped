import { getPortalContext } from "@/lib/portal-auth";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: "No autorizado", data: [] },
        { status: 401 }
      );
    }

    const { data, error } = await ctx.supabase
      .from("calls")
      .select("*")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return Response.json(
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { success: false, message: "Error cargando llamadas", data: [] },
      { status: 500 }
    );
  }
}
