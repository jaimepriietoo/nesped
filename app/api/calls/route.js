import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const auth = cookieStore.get("nesped_auth")?.value;
    const clientId = cookieStore.get("nesped_client_id")?.value;

    if (auth !== "ok") {
      return Response.json(
        { success: false, message: "No autorizado", data: [] },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .eq("client_id", clientId)
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