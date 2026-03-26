import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

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