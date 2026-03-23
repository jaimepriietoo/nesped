import { supabase } from "@/lib/supabase";

function mapClient(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    tagline: row.tagline,
    logoText: row.logo_text,
    prompt: row.prompt || "",
    webhook: row.webhook || "",
    twilioNumber: row.twilio_number || "",
    theme: {
      accent: row.accent,
      accentText: row.accent_text,
      button: row.button,
      badge: row.badge,
    },
  };
}

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

    return Response.json({
      success: true,
      data: (data || []).map(mapClient),
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error cargando clientes", data: [] },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      id,
      name,
      type,
      status,
      tagline,
      logoText,
      prompt,
      webhook,
      twilioNumber,
    } = body;

    if (!id || !name) {
      return Response.json(
        { success: false, message: "Faltan id o name" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({
        id,
        name,
        type,
        status,
        tagline,
        logo_text: logoText,
        prompt,
        webhook,
        twilio_number: twilioNumber,
        accent: "bg-blue-500/20",
        accent_text: "text-blue-300",
        button: "bg-white text-black hover:bg-white/90",
        badge: "bg-emerald-500/15 text-emerald-300",
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
      data: mapClient(data),
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { success: false, message: "Error creando cliente" },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      type,
      status,
      tagline,
      logoText,
      prompt,
      webhook,
      twilioNumber,
    } = body;

    if (!id) {
      return Response.json(
        { success: false, message: "Falta id del cliente" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clients")
      .update({
        name,
        type,
        status,
        tagline,
        logo_text: logoText,
        prompt,
        webhook,
        twilio_number: twilioNumber,
      })
      .eq("id", id)
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
      data: mapClient(data),
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error actualizando cliente" },
      { status: 500 }
    );
  }
}