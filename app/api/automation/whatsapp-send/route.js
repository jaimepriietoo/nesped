import { NextResponse } from "next/server";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { normalizePhone, enviarWhatsApp } from "@/lib/server/twilio";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const { to, message } = await req.json();

    if (!to || !message) {
      return NextResponse.json({ success: false, message: "Faltan datos" }, { status: 400 });
    }

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
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Error enviando WhatsApp" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.automation.whatsapp-send.post", manejarPOST);
