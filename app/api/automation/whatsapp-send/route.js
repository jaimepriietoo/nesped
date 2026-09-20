import { NextResponse } from "next/server";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { normalizePhone, enviarWhatsApp } from "@/lib/server/twilio";
import { validar } from "@/lib/server/esquemas";
import { WhatsappInterno } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(WhatsappInterno, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const { to, message } = entrada.datos;

    const msg = await enviarWhatsApp({
      to: normalizePhone(to),
      text: String(message || "").trim(),
      webhookUrl: "/api/whatsapp/webhook",
    });

    return NextResponse.json({
      success: true,
      sid: msg?.id || msg?.message_id || "",
      messageId: msg?.id || msg?.message_id || "",
    });
  } catch (err) {
    logErrorSeguro("automation.whatsapp_send_failed", err);
    return NextResponse.json(
      { success: false, message: "Error enviando WhatsApp" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.automation.whatsapp-send.post", manejarPOST);
