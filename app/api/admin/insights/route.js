import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function manejarGET() {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message, data: [] },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();

    const { data: insights, error } = await supabase
      .from("ai_insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      return Response.json(
        { success: false, message: "No se pudo completar la operación", data: [] },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: insights || [],
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error cargando análisis", data: [] },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.admin.insights.get", manejarGET);
