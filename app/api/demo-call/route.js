import { getSupabase } from "@/lib/supabase";
import { ensureDemoWorkspace, isDemoClientId } from "@/lib/clients";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import {
  getTelnyxVoiceConfig,
  hasTelnyxVoiceConfig,
} from "@/lib/server/telnyx";

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function isValidPhone(value = "") {
  const normalized = normalizePhone(value);
  return normalized.length >= 9 && normalized.length <= 16;
}

async function startTelnyxDemoCall({
  telefono,
  clientId,
  leadId,
  cleanBaseUrl,
}) {
  const cfg = getTelnyxVoiceConfig();
  const secretPart = cfg.webhookSecret
    ? `&secret=${encodeURIComponent(cfg.webhookSecret)}`
    : "";
  const recordingCallback = `${cleanBaseUrl}/recording-status?provider=telnyx&client_id=${encodeURIComponent(
    clientId
  )}${leadId ? `&lead_id=${encodeURIComponent(leadId)}` : ""}${secretPart}`;
  const voiceUrl = `${cleanBaseUrl}/telnyx/voice?client_id=${encodeURIComponent(
    clientId
  )}${secretPart}`;

  const response = await fetch(
    `https://api.telnyx.com/v2/texml/Accounts/${encodeURIComponent(
      cfg.accountSid
    )}/Calls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ApplicationSid: cfg.applicationId,
        To: telefono,
        From: cfg.phoneNumber,
        Url: voiceUrl,
        UrlMethod: "POST",
        Record: true,
        RecordingChannels: "mono",
        RecordingStatusCallback: recordingCallback,
        RecordingStatusCallbackMethod: "POST",
        RecordingStatusCallbackEvent: "completed",
        SendRecordingUrl: true,
        TimeLimit: 600,
        Timeout: 30,
        StatusCallback: recordingCallback,
        StatusCallbackMethod: "POST",
        StatusCallbackEvent: "answered completed",
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ||
      payload?.message ||
      "Error iniciando llamada Telnyx";
    throw new Error(message);
  }

  return {
    provider: "telnyx",
    callSid:
      payload?.call_sid ||
      payload?.CallSid ||
      payload?.sid ||
      payload?.data?.call_control_id ||
      payload?.data?.call_session_id ||
      "",
    raw: payload,
  };
}

async function handlePost(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para lanzar la llamada"
    );
    if (sameOriginError) return sameOriginError;

    const ipRateLimitError = await requireRateLimitAsync(req, {
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

    const phoneRateLimitError = await requireRateLimitAsync(req, {
      namespace: "demo-call:phone",
      limit: 2,
      windowMs: 30 * 60 * 1000,
      keyParts: [telefono, clientId],
      message:
        "Ese número ya ha recibido demasiadas llamadas de prueba en poco tiempo. Espera unos minutos.",
    });
    if (phoneRateLimitError) return phoneRateLimitError;

    const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");

    if (!cleanBaseUrl) {
      return Response.json(
        {
          success: false,
          message: "La infraestructura de voz no está configurada correctamente",
        },
        { status: 500 }
      );
    }

    const supabase = getSupabase();

    if (isDemoClientId(clientId)) {
      await ensureDemoWorkspace(supabase, clientId);
    } else if (clientId !== "demo") {
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

    if (!hasTelnyxVoiceConfig()) {
      return Response.json(
        {
          success: false,
          message:
            "Telnyx no está configurado correctamente para lanzar la llamada",
        },
        { status: 500 }
      );
    }

    const result = await startTelnyxDemoCall({
      telefono,
      clientId,
      leadId,
      cleanBaseUrl,
    });

    return Response.json({
      success: true,
      callSid: result.callSid || "",
      provider: result.provider,
      message: "Llamada iniciada correctamente",
      recordingEnabled: true,
    });
  } catch (error) {
    logEvent("error", "voice.demo_call_failed", {
      error: {
        name: error?.name || "Error",
        message: error?.message || "Error iniciando llamada",
      },
    });

    return Response.json(
      {
        success: false,
        message: error?.message || "Error iniciando llamada",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.demo-call.post", async (req) => {
  const response = await handlePost(req);

  if (response?.status === 200) {
    const payload = await response.clone().json().catch(() => ({}));
    logEvent("info", "voice.demo_call_started", {
      callSid: payload?.callSid || "",
    });
  }

  return response;
});
