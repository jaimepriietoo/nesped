import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { evaluarAgentes, MODOS } from "@/lib/server/agentes";
import { requireSameOrigin } from "@/lib/server/security";

/** Qué agentes hay, en qué modo están y qué les falta para poder ejecutar. */
export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json({ success: false, message: ctx.message }, { status: 401 });
    }

    const [{ data: cliente }, { data: ajustes }] = await Promise.all([
      ctx.supabase.from("clients").select("twilio_number").eq("id", ctx.clientId).maybeSingle(),
      ctx.supabase
        .from("client_settings")
        .select("auto_sms_enabled,auto_whatsapp_enabled,auto_voice_enabled")
        .eq("client_id", ctx.clientId)
        .maybeSingle(),
    ]);

    return Response.json({
      success: true,
      modos: Object.values(MODOS),
      agentes: evaluarAgentes({ cliente, ajustes }),
    });
  } catch (error) {
    console.error("GET /api/portal/agentes error:", error);
    return Response.json({ success: false, message: "No se pudo leer los agentes" }, { status: 500 });
  }
}

/**
 * Cambia el modo de un agente.
 *
 * Poner un agente a ejecutar solo es decidir que un programa hable en nombre
 * de la empresa sin que nadie lo lea antes, así que se pide el mismo rol que
 * para tocar la facturación. Y no se acepta "solo" si el canal no está: no
 * por seguridad del sistema, sino para que nadie se quede creyendo que algo
 * está funcionando cuando no puede estarlo.
 */
export async function PATCH(req) {
  try {
    const origenError = requireSameOrigin(req, "Origen no permitido");
    if (origenError) return origenError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json({ success: false, message: ctx.message }, { status: 401 });
    }
    if (!hasRole(ctx.role, ["owner", "admin"])) {
      return Response.json(
        { success: false, message: "Solo el propietario puede cambiar cómo actúan los agentes." },
        { status: 403 }
      );
    }

    const { agenteId, modo } = await req.json().catch(() => ({}));
    if (!MODOS[modo]) {
      return Response.json({ success: false, message: "Modo desconocido" }, { status: 400 });
    }

    const [{ data: cliente }, { data: ajustes }] = await Promise.all([
      ctx.supabase.from("clients").select("twilio_number").eq("id", ctx.clientId).maybeSingle(),
      ctx.supabase
        .from("client_settings")
        .select("auto_sms_enabled,auto_whatsapp_enabled,auto_voice_enabled")
        .eq("client_id", ctx.clientId)
        .maybeSingle(),
    ]);

    const agente = evaluarAgentes({ cliente, ajustes }).find((a) => a.id === agenteId);
    if (!agente) {
      return Response.json({ success: false, message: "Agente desconocido" }, { status: 404 });
    }

    if (modo === "solo" && !agente.puedeEjecutar) {
      return Response.json(
        { success: false, message: agente.motivoBloqueo || "Ese agente todavía no puede ejecutar." },
        { status: 409 }
      );
    }

    const { error } = await ctx.supabase
      .from("client_settings")
      .update({ [agente.ajuste]: modo === "solo" })
      .eq("client_id", ctx.clientId);

    if (error) throw new Error(error.message);

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "agente",
      entity_id: agenteId,
      action: "modo_cambiado",
      actor: ctx.currentUser?.full_name || ctx.userEmail,
      changes: { modo },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/portal/agentes error:", error);
    return Response.json({ success: false, message: "No se pudo cambiar el modo" }, { status: 500 });
  }
}
