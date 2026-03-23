import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id,email,role,client_id,created_at")
      .order("created_at", { ascending: true });

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
      { success: false, message: "Error cargando usuarios", data: [] },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, password, role, clientId } = body;

    if (!email || !password || !clientId) {
      return Response.json(
        { success: false, message: "Faltan email, password o clientId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        email,
        password,
        role: role || "client",
        client_id: clientId,
      })
      .select()
      .single();

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { success: false, message: "Error creando usuario" },
      { status: 500 }
    );
  }
}