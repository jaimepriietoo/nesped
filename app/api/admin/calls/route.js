import { getSupabase } from "@/lib/supabase";
import { getAdminContext } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";

const supabase = getSupabase();

async function manejarGET() {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message, data: [] },
        { status: admin.status || 401 }
      );
    }

    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return Response.json(
        { success: false, message: "No se pudo completar la operación", data: [] },
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

export const GET = observeRoute("api.admin.calls.get", manejarGET);
