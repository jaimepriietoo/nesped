import { getSupabase } from "@/lib/supabase";
import { ensureDemoWorkspace, isDemoClientId } from "@/lib/clients";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { conCortacircuitos, noEsDelProveedor } from "@/lib/server/cortacircuitos";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { toE164 } from "@/lib/server/phone";

function normalizePhone(value = "") {
  return toE164(value);
}

function isValidPhone(value = "") {
  const normalized = normalizePhone(value);
  return /^\+34(?:[67]\d{8}|[89][1-8]\d{7})$/.test(normalized);
}

/**
 * Configuración de la llamada saliente de demostración.
 *
 * Antes esto lo hacía Telnyx con TeXML: Nesped lanzaba la llamada, Telnyx
 * pedía instrucciones a nuestro servidor de voz y ese servidor puenteaba el
 * audio contra OpenAI en tiempo real.
 *
 * Ahora la llamada la lanza ElevenLabs sobre el número de Twilio que tenga
 * conectado, y la conversación entera es suya. Nesped sólo dice a quién llamar.
 */
function configuracionDeVoz() {
  const limpio = (v) => String(v || "").trim();
  return {
    apiKey: limpio(process.env.ELEVENLABS_API_KEY),
    agentId: limpio(process.env.ELEVENLABS_AGENT_ID),
    /* El identificador que ElevenLabs da al número importado de Twilio. No es
       el número: es su id dentro de ElevenLabs, y sale al conectarlo. */
    phoneNumberId: limpio(process.env.ELEVENLABS_PHONE_NUMBER_ID),
  };
}

function hayVozConfigurada() {
  const c = configuracionDeVoz();
  return Boolean(c.apiKey && c.agentId && c.phoneNumberId);
}

async function lanzarLlamadaDeDemostracion({ telefono, clientId, leadId }) {
  const cfg = configuracionDeVoz();

  return conCortacircuitos({ proveedor: "elevenlabs", quienEspera: "persona" }, async () => {
    const respuesta = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: {
          "xi-api-key": cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: cfg.agentId,
          agent_phone_number_id: cfg.phoneNumberId,
          to_number: telefono,
          /* Estas variables las lee el prompt del agente. Es lo que hace que
             la llamada de demostración suene a la empresa correcta y no a una
             genérica. */
          conversation_initiation_client_data: {
            dynamic_variables: {
              client_id: clientId,
              lead_id: leadId || "",
              es_demostracion: "true",
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    const payload = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) {
      return {
        provider: "elevenlabs",
        callSid: payload?.conversation_id || payload?.callSid || "",
        raw: payload,
      };
    }

    const error = new Error(
      payload?.detail?.message || payload?.detail || payload?.message ||
        `ElevenLabs devolvió ${respuesta.status}`
    );
    error.estado = respuesta.status;

    /* Un número mal escrito o un agente que no existe son culpa nuestra, no
       una caída de ElevenLabs. Contarlo abriría el circuito por datos malos. */
    if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 429) {
      throw noEsDelProveedor(error);
    }

    throw error;
  });
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
    const ctx = await getPortalContext();
    if (ctx.ok && !hasRole(ctx.role, ["owner", "admin", "manager"])) {
      return Response.json({ success: false, message: "Sin permisos para llamar" }, { status: 403 });
    }
    const clientId = ctx.ok ? ctx.clientId : "demo";
    const leadId = ctx.ok ? String(body.lead_id || "").trim() : "";

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
      keyParts: [telefono],
      includeIp: false,
      message:
        "Ese número ya ha recibido demasiadas llamadas de prueba en poco tiempo. Espera unos minutos.",
    });
    if (phoneRateLimitError) return phoneRateLimitError;

    const supabase = getSupabase();
    if (leadId) {
      const { data: lead, error } = await supabase.from("leads").select("id")
        .eq("id", leadId).eq("client_id", clientId).maybeSingle();
      if (error || !lead) return Response.json({ success: false, message: "Contacto no disponible" }, { status: 404 });
    }

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

    if (!hayVozConfigurada()) {
      /* Falta el número. Se dice claro y sin detalles de proveedor: quien
         pulsa el botón en la web no tiene por qué enterarse de con quién
         trabajamos ni de qué variable falta. */
      return Response.json(
        {
          success: false,
          message: "Las llamadas de prueba todavía no están disponibles.",
        },
        { status: 503 }
      );
    }

    const dailyLimit = await requireRateLimitAsync(req, {
      namespace: "voice:demo:daily", limit: 20, windowMs: 24 * 60 * 60 * 1000, includeIp: false,
    });
    if (dailyLimit) return dailyLimit;
    const result = await lanzarLlamadaDeDemostracion({ telefono, clientId, leadId });

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
        message: "Error iniciando llamada",
      },
    });

    return Response.json(
      {
        success: false,
        message: "Error iniciando llamada",
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
