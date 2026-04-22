import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();
    const body = await req.json();

    const {
      id,
      name,
      prompt = "",
      webhook = "",
      twilio_number = "",
      owner_email = "",
      brand_name = "",
      primary_color = "#ffffff",
      secondary_color = "#030303",
      industry = "",
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
        prompt,
        webhook,
        twilio_number,
        owner_email,
        brand_name: brand_name || name,
        primary_color,
        secondary_color,
        industry,
      })
      .select()
      .single();

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    await supabase.from("client_settings").insert({
      client_id: id,
      weekly_report_email: owner_email || null,
      daily_report_email: owner_email || null,
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando cliente" },
      { status: 500 }
    );
  }
}
