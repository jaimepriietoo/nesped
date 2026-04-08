import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const { clientId, full_name, email, role = "agent", phone = "" } = body;

    if (!clientId || !full_name || !email) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("portal_users")
      .insert({
        client_id: clientId,
        full_name,
        email,
        role,
        phone,
      })
      .select()
      .single();

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    await supabase.from("audit_logs").insert({
      client_id: clientId,
      entity_type: "user",
      entity_id: data.id,
      action: "created",
      actor: "portal_admin",
      changes: { full_name, email, role, phone },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando usuario" },
      { status: 500 }
    );
  }
}