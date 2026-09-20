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

    if (!puede(ctx.role, "inbox.reply", ctx.permissions)) {
      return NextResponse.json(
        { success: false, message: "Sin permisos" },
        { status: 403 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "automation-whatsapp-autoreply",
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
      .select("id, telefono, nombre, necesidad, status")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (error || !lead?.telefono) {
      return NextResponse.json(
        { success: false, message: "Lead sin teléfono" },
        { status: 404 }
      );
    }

    let message = "";

    if (lead.status === "new") {
      message = `Hola ${lead.nombre}, soy del equipo. ¿Sigues interesado en ${lead.necesidad}?`;
    } else if (lead.status === "contacted") {
      message = `Perfecto ${lead.nombre}, ¿te viene bien una llamada de 10 minutos para ayudarte?`;
    } else if (lead.status === "qualified") {
      message = "Te dejo aquí mi agenda para ayudarte: https://cal.com/TU_LINK";
    } else {
      message = "Seguimos disponibles para ayudarte.";
    }

    const phone = String(lead.telefono || "").replace(/[^\d+]/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      success: true,
      url,
      message,
    });
  } catch (err) {
    logErrorSeguro("automation.whatsapp_autoreply_failed", err);
    return NextResponse.json(
      { success: false, message: "Error IA" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.automation.whatsapp-autoreply.post", manejarPOST);
