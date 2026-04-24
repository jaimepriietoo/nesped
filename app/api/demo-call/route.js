import twilio from "twilio";
import { getSupabase } from "@/lib/supabase";
import { requireRateLimit, requireSameOrigin } from "@/lib/server/security";

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function isValidPhone(value = "") {
  const normalized = normalizePhone(value);
  return normalized.length >= 9 && normalized.length <= 16;
}

export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para lanzar la llamada"
    );
    if (sameOriginError) return sameOriginError;

    const ipRateLimitError = requireRateLimit(req, {
      namespace: "demo-call:ip",
      limit: 5,
      windowMs: 15 * 60 * 1000,
      message: "Has alcanzado el límite de llamadas de prueba. Espera un poco y vuelve a intentarlo.",
    });
    if (ipRateLimitError) return ipRateLimitError;

    const body = await req.json();
    const telefono = normalizePhone(body.telefono);
    const clientId = String(body.client_id || "demo").trim() || "demo";
    const leadId = String(body.lead_id || "").trim();

    if (!telefono) {
      return Response.json(
        { success: false, message: "Falta teléfono" },
        { status: 400 }
      );
    }

    if (!isValidPhone(telefono)) {
      return Response.json(
        { success: false, message: "El teléfono no parece válido" },
        { status: 400 }
      );
    }

    const phoneRateLimitError = requireRateLimit(req, {
      namespace: "demo-call:phone",
      limit: 2,
      windowMs: 30 * 60 * 1000,
      keyParts: [telefono, clientId],
      message:
        "Ese número ya ha recibido demasiadas llamadas de prueba en poco tiempo. Espera unos minutos.",
    });
    if (phoneRateLimitError) return phoneRateLimitError;

    const accountSid =
      process.env.TWILIO_ACCOUNT_SID || process.env.ACCOUNT_SID;
    const authToken =
      process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN;
    const fromNumber =
      process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMERO;

    const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");

    if (!accountSid || !authToken || !fromNumber || !cleanBaseUrl) {
      return Response.json(
        {
          success: false,
          message: "La infraestructura de voz no está configurada correctamente",
        },
        { status: 500 }
      );
    }

    if (clientId !== "demo") {
      const supabase = getSupabase();
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .maybeSingle();

      if (!client) {
        return Response.json(
          { success: false, message: "Cliente no encontrado" },
          { status: 404 }
        );
      }
    }

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      url: `${cleanBaseUrl}/voice?client_id=${clientId}`,
      to: telefono,
      from: fromNumber,
      method: "POST",
      record: true,
      recordingStatusCallback: `${cleanBaseUrl}/recording-status?client_id=${encodeURIComponent(
        clientId
      )}${leadId ? `&lead_id=${encodeURIComponent(leadId)}` : ""}`,
      recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: "completed",
      timeLimit: 600,
    });

    return Response.json({
      success: true,
      callSid: call.sid,
      message: "Llamada iniciada correctamente",
      recordingEnabled: true,
    });
  } catch (error) {
    console.error("Error llamada demo:", error);

    return Response.json(
      {
        success: false,
        message: error?.message || "Error iniciando llamada",
      },
      { status: 500 }
    );
  }
}
