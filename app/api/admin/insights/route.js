import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
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
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: insights || [],
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando insights", data: [] },
      { status: 500 }
    );
  }
}
