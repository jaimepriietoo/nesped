import { getPortalContext } from "@/lib/portal-auth";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
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
        { success: false, message: "Error cargando llamadas", data: [] },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: (data || []).map(({ recording_url, grabacion_propia, ...call }) => ({
        ...call,
        tiene_grabacion: Boolean(grabacion_propia),
      })),
    });
  } catch (error) {
    logErrorSeguro("calls.load_failed", error);

    return Response.json(
      { success: false, message: "Error cargando llamadas", data: [] },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.calls.get", manejarGET);
