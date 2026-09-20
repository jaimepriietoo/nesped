import { validar } from "@/lib/server/esquemas";
import { ActualizarClienteAdmin } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";
import { esTelefonoValido, toE164 } from "@/lib/server/phone";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function manejarPATCH(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "admin-client-update-legacy", limit: 40, keyParts: [admin.userEmail || "admin"],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 64 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(ActualizarClienteAdmin, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const supabase = getSupabase();
    const body = entrada.datos;

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

    const cambios = Object.fromEntries(Object.entries({
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
    }).filter(([, valor]) => valor !== undefined));

    const { data, error } = await supabase
      .from("clients")
      .update(cambios)
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
        { success: false, message: "No se pudo completar la operación" },
        { status: 500 }
      );
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      client_id: id,
      entity_type: "client",
      entity_id: id,
      action: "admin_client_updated",
      actor: admin.userEmail || "admin",
      changes: { fields: Object.keys(cambios).sort() },
    });
    if (auditError) throw new Error("No se pudo registrar la auditoría");

    return Response.json({ success: true, data });
  } catch (error) {
    logErrorSeguro("admin.client_update_legacy_failed", error);
    return Response.json(
      { success: false, message: "Error actualizando cliente" },
      { status: 500 }
    );
  }
}

export const PATCH = observeRoute("api.admin.clients.update.patch", manejarPATCH);
