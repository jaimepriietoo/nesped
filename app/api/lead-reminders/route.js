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
      .from("lead_reminders")
      .select("*")
      .eq("lead_id", leadId)
      .order("remind_at", { ascending: true });

    if (error) {
      return Response.json(
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    return Response.json({ success: true, data: data || [] });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando recordatorios", data: [] },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const { lead_id, client_id, assigned_to = "", title, remind_at } = body;

    if (!lead_id || !client_id || !title || !remind_at) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("lead_reminders")
      .insert({
        lead_id,
        client_id,
        assigned_to,
        title,
        remind_at,
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
      type: "reminder_created",
      title: "Recordatorio creado",
      description: `${title} · ${new Date(remind_at).toLocaleString()}`,
      meta: { assigned_to },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando recordatorio" },
      { status: 500 }
    );
  }
}