import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { validar } from "@/lib/server/esquemas";
import { AccionSobreLead } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "automations.run", ctx.permissions)) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para automatizar WhatsApp" },
        { status: 403 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "automation-whatsapp-autopilot",
      limit: 60,
      keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(AccionSobreLead, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const { leadId } = entrada.datos;

    const { data: lead, error } = await ctx.supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (error || !lead) {
      return NextResponse.json(
        { success: false, message: "Lead no encontrado" },
        { status: 404 }
      );
    }

    let message = "";

    if (lead.status === "new") {
      message = `Hola ${lead.nombre}, vimos tu solicitud.`;
    } else if (lead.status === "contacted") {
      message = "¿Te viene bien hablar hoy 10 min?";
    } else if (lead.status === "qualified") {
      message = "Reserva aquí: https://cal.com/TU_LINK";
    } else {
      return NextResponse.json({
        success: false,
        message: "Este lead no tiene una automatización de WhatsApp aplicable.",
      });
    }

    return NextResponse.json({ success: true, message });
  } catch (err) {
    logErrorSeguro("automation.whatsapp_autopilot_failed", err);
    return NextResponse.json(
      { success: false, message: "Error en WhatsApp autopilot" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.automation.whatsapp-autopilot.post", manejarPOST);
