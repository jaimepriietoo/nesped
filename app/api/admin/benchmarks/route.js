import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("performance_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

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
    return Response.json(
      { success: false, message: error.message || "Error cargando benchmarks", data: [] },
      { status: 500 }
    );
  }
}