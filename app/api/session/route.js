import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

function mapClient(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    tagline: row.tagline,
    logoText: row.logo_text,
    theme: {
      accent: row.accent,
      accentText: row.accent_text,
      button: row.button,
      badge: row.badge,
    },
  };
}

export async function GET() {
  const cookieStore = await cookies();

  const auth = cookieStore.get("nesped_auth")?.value;
  const clientId = cookieStore.get("nesped_client_id")?.value || "demo";

  if (auth !== "ok") {
    return Response.json({
      success: false,
      authenticated: false,
    });
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error || !data) {
    return Response.json({
      success: false,
      authenticated: true,
      clientId,
      clientName: clientId,
      client: null,
    });
  }

  const client = mapClient(data);

  return Response.json({
    success: true,
    authenticated: true,
    clientId: client.id,
    clientName: client.name,
    client,
  });
}