import { getSupabase } from "@/lib/supabase";
import { CLIENT_LIST, mapClientToPublicShape } from "@/lib/clients";

const supabase = getSupabase();

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
      brandName: client.brand_name || client.name,
      brandLogoUrl: client.brand_logo_url || "",
      type: client.type,
      status: client.status,
      tagline: client.tagline,
      logoText: client.logo_text,
      customDomain: client.custom_domain || "",
      theme: {
        accent: client.accent,
        accentText: client.accent_text,
        button: client.button,
        badge: client.badge,
      },
    }));

    const existingIds = new Set(clients.map((client) => client.id));
    const seededClients = CLIENT_LIST.filter((client) => !existingIds.has(client.id)).map(
      mapClientToPublicShape
    );

    return Response.json({
      success: true,
      data: [...clients, ...seededClients],
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error cargando clientes", data: [] },
      { status: 500 }
    );
  }
}
