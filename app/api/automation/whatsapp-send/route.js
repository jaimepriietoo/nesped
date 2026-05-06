import { NextResponse } from "next/server";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { normalizePhone, sendTelnyxWhatsApp } from "@/lib/server/telnyx";

export async function POST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const { to, message } = await req.json();

    if (!to || !message) {
      return NextResponse.json({ success: false, message: "Faltan datos" }, { status: 400 });
    }

    const msg = await sendTelnyxWhatsApp({
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
