import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json(
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    const clients = (data || []).map((client) => ({
      id: client.id,
      name: client.name,
      type: client.type,
      status: client.status,
      tagline: client.tagline,
      logoText: client.logo_text,
      theme: {
        accent: client.accent,
        accentText: client.accent_text,
        button: client.button,
        badge: client.badge,
      },
    }));

    return Response.json({
      success: true,
      data: clients,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error cargando clientes", data: [] },
      { status: 500 }
    );
  }
}