import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");

    if (!leadId) {
      return Response.json(
        { success: false, message: "Falta lead_id", data: [] },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json(
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    return Response.json({ success: true, data: data || [] });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando notas", data: [] },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const { lead_id, client_id, author = "portal_user", body: noteBody } = body;

    if (!lead_id || !client_id || !noteBody) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("lead_notes")
      .insert({
        lead_id,
        client_id,
        author,
        body: noteBody,
      })
      .select()
      .single();

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    await supabase.from("lead_events").insert({
      lead_id,
      client_id,
      type: "note_added",
      title: "Nota interna añadida",
      description: noteBody,
      meta: { author },
    });

    await supabase.from("audit_logs").insert({
      client_id,
      entity_type: "lead",
      entity_id: lead_id,
      action: "note_added",
      actor: author,
      changes: { note: noteBody },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando nota" },
      { status: 500 }
    );
  }
}