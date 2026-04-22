import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function PATCH(req) {
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
      prompt,
      webhook,
      twilio_number,
      owner_email,
      brand_name,
      primary_color,
      secondary_color,
      industry,
      is_active,
    } = body;

    if (!id) {
      return Response.json(
        { success: false, message: "Falta id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clients")
      .update({
        name,
        prompt,
        webhook,
        twilio_number,
        owner_email,
        brand_name,
        primary_color,
        secondary_color,
        industry,
        is_active,
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

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error actualizando cliente" },
      { status: 500 }
    );
  }
}
