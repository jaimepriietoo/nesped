import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function PATCH(req) {
  try {
    const cookieStore = await cookies();
    const auth = cookieStore.get("nesped_auth")?.value;
    const clientId = cookieStore.get("nesped_client_id")?.value || "demo";

    if (auth !== "ok" && clientId !== "demo") {
      return Response.json(
        { success: false, message: "No autorizado" },
        { status: 401 }
      );
    }

    const supabase = getSupabase();
    const body = await req.json();

    const {
      leadId,
      status,
      owner,
      notes,
      proxima_accion,
      ultima_accion,
      valor_estimado,
    } = body;

    if (!leadId) {
      return Response.json(
        { success: false, message: "Falta leadId" },
        { status: 400 }
      );
    }

    const changes = {
      ...(status !== undefined ? { status } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(proxima_accion !== undefined ? { proxima_accion } : {}),
      ...(ultima_accion !== undefined ? { ultima_accion } : {}),
      ...(valor_estimado !== undefined ? { valor_estimado } : {}),
    };

    const { data: updatedLead, error } = await supabase
      .from("leads")
      .update(changes)
      .eq("id", leadId)
      .eq("client_id", clientId)
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
      entity_type: "lead",
      entity_id: leadId,
      action: "updated",
      actor: "portal_user",
      changes,
    });

    await supabase.from("lead_events").insert({
      lead_id: leadId,
      client_id: clientId,
      type: "lead_updated",
      title: "Lead actualizado desde el portal",
      description: "Se han modificado campos del lead desde el portal del cliente.",
      meta: changes,
    });

    return Response.json({
      success: true,
      data: updatedLead,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error actualizando lead" },
      { status: 500 }
    );
  }
}