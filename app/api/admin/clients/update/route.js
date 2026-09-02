import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";
import { esTelefonoValido, toE164 } from "@/lib/server/phone";

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
      twilio_number: twilioNumberRaw,
      original_number: originalNumberRaw,
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

    // Mismo motivo que en la creación: normalizar antes de guardar es lo
    // único que hace que el enrutado por número funcione de forma fiable.
    const twilio_number =
      twilioNumberRaw === undefined ? undefined : toE164(twilioNumberRaw) || null;
    const original_number =
      originalNumberRaw === undefined ? undefined : toE164(originalNumberRaw) || null;

    if (twilio_number && !esTelefonoValido(twilio_number)) {
      return Response.json(
        { success: false, message: "El número de Telnyx no es un teléfono válido" },
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
        original_number,
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
      if (error.code === "23505") {
        return Response.json(
          {
            success: false,
            message: `El número ${twilio_number} ya está asignado a otro cliente.`,
          },
          { status: 409 }
        );
      }
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
