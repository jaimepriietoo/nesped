import { getSupabase } from "@/lib/supabase";
import { getClientById, isDemoClientId, mapClientToPublicShape } from "@/lib/clients";
import { getAuthenticatedUserContext } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";

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

async function handleGet() {
  const auth = await getAuthenticatedUserContext();
  if (!auth.ok) {
    return Response.json({
      success: false,
      authenticated: false,
    });
  }

  const clientId = auth.user.client_id;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error || !data) {
    const fallbackClient = isDemoClientId(clientId)
      ? mapClientToPublicShape(getClientById(clientId))
      : null;

    return Response.json({
      success: Boolean(fallbackClient),
      authenticated: true,
      clientId,
      clientName: fallbackClient?.name || clientId,
      client: fallbackClient,
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

export const GET = observeRoute("api.session.get", handleGet);
