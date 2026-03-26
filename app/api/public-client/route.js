import { supabase } from "@/lib/supabase";

function mapClient(client) {
  return {
    id: client.id,
    name: client.name,
    type: client.type,
    status: client.status,
    tagline: client.tagline,
    logoText: client.logo_text,
    prompt: client.prompt || "",
    webhook: client.webhook || "",
    twilioNumber: client.twilio_number || "",
    customDomain: client.custom_domain || "",
    theme: {
      accent: client.accent,
      accentText: client.accent_text,
      button: client.button,
      badge: client.badge,
    },
  };
}

export async function GET(req) {
  try {
    const host = req.headers.get("host") || "";
    const hostname = host.split(":")[0];

    const parts = hostname.split(".");
    let subdomain = "";

    if (parts.length >= 3) {
      subdomain = parts[0];
    }

    let query = null;

    if (subdomain && subdomain !== "www") {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", subdomain)
        .single();

      query = data || null;
    } else {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("custom_domain", hostname)
        .single();

      query = data || null;
    }

    return Response.json({
      success: true,
      client: query ? mapClient(query) : null,
    });
  } catch (error) {
    console.error("public-client error:", error);

    return Response.json(
      {
        success: false,
        client: null,
      },
      { status: 500 }
    );
  }
}