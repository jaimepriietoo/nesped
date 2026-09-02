import { createClient } from "@supabase/supabase-js";
import { safeUpsertClientSettings } from "@/lib/client-settings";
import { getAdminContext } from "@/lib/server/auth";
import { esTelefonoValido, toE164 } from "@/lib/server/phone";

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
      twilio_number: twilioNumberRaw = "",
      original_number: originalNumberRaw = "",
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

    // Se normaliza a E.164 antes de guardar: si no, "+34983460825" y
    // "34983460825" cuentan como números distintos y el enrutado de
    // llamadas por número falla según cómo se haya tecleado.
    const twilio_number = twilioNumberRaw ? toE164(twilioNumberRaw) : "";
    const original_number = originalNumberRaw ? toE164(originalNumberRaw) : "";

    if (twilio_number && !esTelefonoValido(twilio_number)) {
      return Response.json(
        { success: false, message: "El número de Telnyx no es un teléfono válido" },
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
        twilio_number: twilio_number || null,
        original_number: original_number || null,
        owner_email,
        brand_name: brand_name || name,
        primary_color,
        secondary_color,
        industry,
      })
      .select()
      .single();

    if (error) {
      // El índice único de la base de datos rechaza dos clientes con el
      // mismo twilio_number. Se traduce el código de Postgres a un mensaje
      // que tenga sentido en el admin, en vez del texto crudo de Supabase.
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

    const { error: settingsError } = await safeUpsertClientSettings(
      supabase,
      {
        client_id: id,
        weekly_report_email: owner_email || null,
        daily_report_email: owner_email || null,
      },
      { onConflict: "client_id" }
    );

    if (settingsError) {
      console.error("Error creando client_settings:", settingsError.message);
    }

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error creando cliente" },
      { status: 500 }
    );
  }
}
