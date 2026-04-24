import { NextResponse } from "next/server";
import twilio from "twilio";
import { requireInternalRequest } from "@/lib/server/internal-api";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function normalizeWhatsAppAddress(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("whatsapp:")
    ? normalized
    : `whatsapp:${normalizePhone(normalized)}`;
}

export async function POST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const { to, message } = await req.json();

    if (!to || !message) {
      return NextResponse.json({ success: false, message: "Faltan datos" }, { status: 400 });
    }

    const msg = await client.messages.create({
      from: normalizeWhatsAppAddress(process.env.TWILIO_WHATSAPP_NUMBER),
      to: normalizeWhatsAppAddress(to),
      body: message,
    });

    return NextResponse.json({
      success: true,
      sid: msg.sid,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Error enviando WhatsApp" },
      { status: 500 }
    );
  }
}
