import { ETIQUETA_AGENTE, caracteresDelAgente } from "@/lib/server/consumo-voz";
import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { toE164 } from "@/lib/server/phone";
import { emitirWebhook, EVENTOS } from "@/lib/server/webhooks-salientes";
import { pedirClasificacion } from "@/lib/server/clasificacion";
import { encolar } from "@/lib/server/cola";
import { logErrorSeguro, logEvent } from "@/lib/server/observability.mjs";

function toTrimmed(value = "") {
  return String(value || "").trim();
}

// Reexportado desde lib/server/phone.js: la versión anterior solo quitaba
// caracteres raros, así que "+34983460825" y "34983460825" no coincidían y
// el enrutado por número fallaba según cómo se hubiera tecleado el número.
export const normalizePhone = toE164;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getElevenLabsHybridConfig() {
  return {
    agentId: toTrimmed(process.env.ELEVENLABS_AGENT_ID),
    apiKey: toTrimmed(process.env.ELEVENLABS_API_KEY),
    webhookSecret: toTrimmed(process.env.ELEVENLABS_WEBHOOK_SECRET),
    internalToken: toTrimmed(
      process.env.INTERNAL_API_TOKEN ||
        process.env.CRON_SECRET
    ),
    voiceNumber: normalizePhone(process.env.TWILIO_PHONE_NUMBER || ""),
    baseUrl: toTrimmed(
      process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
    ).replace(/\/+$/, ""),
  };
}

export function hasElevenLabsHybridConfig() {
  const config = getElevenLabsHybridConfig();
  return Boolean(
    config.agentId &&
      config.internalToken &&
      config.voiceNumber &&
      config.baseUrl
  );
}

export function isAuthorizedElevenLabsWebhook(req) {
  const expectedSecret = getElevenLabsHybridConfig().webhookSecret;
  if (!expectedSecret) return false;

  // Nunca en la URL: proxies, analítica e historiales suelen conservarla.
  const receivedSecret = toTrimmed(req.headers.get("x-nesped-provider-secret"));

  return safeEqual(expectedSecret, receivedSecret);
}

function parseElevenLabsSignatureHeader(value = "") {
  const entries = String(value || "")
    .split(",")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  const parsed = Object.fromEntries(
    entries.map((entry) => {
      const [key, ...rest] = entry.split("=");
      return [String(key || "").trim(), rest.join("=").trim()];
    })
  );

  return {
    timestamp: parsed.t || "",
    signature: parsed.v0 || "",
  };
}

export function verifyElevenLabsWebhookSignature({
  rawBody = "",
  signatureHeader = "",
  secret = getElevenLabsHybridConfig().webhookSecret,
  toleranceSeconds = 5 * 60,
} = {}) {
  const expectedSecret = toTrimmed(secret);
  if (!expectedSecret) return false;

  const { timestamp, signature } = parseElevenLabsSignatureHeader(
    signatureHeader
  );

  if (!timestamp || !signature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > toleranceSeconds) {
    return false;
  }

  const mac = crypto
    .createHmac("sha256", expectedSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return safeEqual(signature, mac);
}

function summarizeClientPrompt(prompt = "") {
  const clean = toTrimmed(prompt).replace(/\s+/g, " ");
  if (!clean) return "";
  if (clean.length <= 340) return clean;
  return `${clean.slice(0, 337)}...`;
}

export async function resolveClientByVoiceNumber({
  supabase = getSupabase(),
  clientId = "",
  calledNumber = "",
} = {}) {
  if (clientId) {
    const { data, error } = await supabase
      .from("clients")
      .select("id,name,brand_name,industry,prompt,twilio_number")
      .eq("id", clientId)
      .single();

    if (!error && data) {
      return data;
    }
  }

  const normalizedNumber = normalizePhone(calledNumber);
  if (!normalizedNumber) return null;

  const { data, error } = await supabase
    .from("clients")
    .select("id,name,brand_name,industry,prompt,twilio_number");

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message || "No se pudieron cargar clientes");
  }

  return (
    data.find(
      (item) => normalizePhone(item.twilio_number || "") === normalizedNumber
    ) || null
  );
}

export async function findLeadByPhone({
  supabase = getSupabase(),
  clientId = "",
  callerId = "",
} = {}) {
  const normalizedPhone = normalizePhone(callerId);
  if (!clientId || !normalizedPhone) return null;

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message || "No se pudieron cargar contactos");
  }

  return (
    (data || []).find(
      (lead) => normalizePhone(lead.telefono || "") === normalizedPhone
    ) || null
  );
}

async function calculateLeadScore({
  supabase = getSupabase(),
  nombre = "",
  telefono = "",
  necesidad = "",
  ciudad = "",
} = {}) {
  try {
    const { data, error } = await supabase.rpc("calculate_lead_score", {
      p_nombre: nombre,
      p_telefono: telefono,
      p_necesidad: necesidad,
      p_ciudad: ciudad || null,
    });

    if (!error && typeof data === "number") {
      return data;
    }
  } catch {}

  let score = 45;
  if (nombre) score += 10;
  if (telefono) score += 10;
  if (necesidad) score += 15;
  if (ciudad) score += 5;
  return Math.max(0, Math.min(100, score));
}

function mergeTags(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function toLeadInterest(score) {
  if (score >= 80) return "alto";
  if (score >= 50) return "medio";
  return "bajo";
}

async function safeInsertLeadEvent(
  supabase,
  { leadId = null, clientId = "", phone = "", type, title, description, meta }
) {
  /* Sin contacto no hay evento de contacto: lead_id es obligatorio en la
     tabla y una llamada de un número desconocido no tiene a quién colgarse.
     Antes esto reventaba con "null value in column lead_id" y la llamada
     entera se daba por fallida; la llamada ya está guardada en calls, que es
     lo que importa. */
  if (!leadId) return;

  const richPayload = {
    lead_id: leadId,
    client_id: clientId,
    type,
    title,
    description,
    meta,
    created_at: new Date().toISOString(),
  };

  /* El teléfono va dentro de meta: lead_events no tiene columna phone. El
     respaldo que había (phone + message) era de un esquema que ya no
     existe y tapaba el error real con "Could not find the 'message' column". */
  if (phone) richPayload.meta = { ...(richPayload.meta || {}), phone: normalizePhone(phone) };

  const richRes = await supabase.from("lead_events").insert(richPayload);
  if (richRes.error) {
    throw new Error(richRes.error.message || "No se pudo guardar el evento");
  }
}

async function safeInsertAuditLog(
  supabase,
  { clientId = "", entityType = "lead", entityId = "", action, actor, changes }
) {
  const result = await supabase.from("audit_logs").insert({
    client_id: clientId,
    entity_type: entityType,
    entity_id: entityId || null,
    action,
    actor,
    changes,
    created_at: new Date().toISOString(),
  });

  if (!result.error) return;

  const fallback = await supabase.from("audit_logs").insert({
    client_id: clientId,
    entity_type: entityType,
    entity_id: entityId || null,
    action,
    actor,
    changes: JSON.stringify(changes || {}),
    created_at: new Date().toISOString(),
  });

  if (fallback.error) {
    throw new Error(
      fallback.error.message || result.error.message || "No se pudo guardar el audit log"
    );
  }
}

export async function buildElevenLabsContext({
  supabase = getSupabase(),
  clientId = "",
  callerId = "",
  calledNumber = "",
  conversationId = "",
} = {}) {
  const client = await resolveClientByVoiceNumber({
    supabase,
    clientId,
    calledNumber,
  });

  if (!client?.id) {
    throw new Error("No se pudo resolver el cliente por el numero de voz");
  }

  const lead = await findLeadByPhone({
    supabase,
    clientId: client.id,
    callerId,
  });

  const brandName = client.brand_name || client.name || "Nesped";

  return {
    response: {
      clientId: client.id,
      companyName: client.name || brandName,
      brandName,
      industry: client.industry || "",
      companySummary: summarizeClientPrompt(client.prompt || ""),
      companyPrompt: summarizeClientPrompt(client.prompt || ""),
      callerId: normalizePhone(callerId),
      calledNumber: normalizePhone(calledNumber || client.twilio_number || ""),
      conversationId: toTrimmed(conversationId),
      leadId: lead?.id || "",
      leadName: lead?.nombre || "",
      /* Identidad sí; memoria conversacional no. Estos campos antiguos se
         conservan vacíos para no romper integraciones que esperan la forma. */
      leadNeed: "",
      leadStatus: "",
      leadOwner: "",
      leadSummary: "",
      callObjective: "",
      shouldCreateLead: !lead,
    },
  };
}

export async function upsertElevenLabsLead({
  supabase = getSupabase(),
  clientId = "",
  callerId = "",
  calledNumber = "",
  conversationId = "",
  name = "",
  email = "",
  phone = "",
  city = "",
  address = "",
  need = "",
  preference = "",
  summary = "",
  owner = "",
  status = "",
  notes = "",
} = {}) {
  const client = await resolveClientByVoiceNumber({
    supabase,
    clientId,
    calledNumber,
  });

  if (!client?.id) {
    throw new Error("No se pudo resolver el cliente para guardar el contacto");
  }

  const normalizedPhone = normalizePhone(callerId);
  if (!normalizedPhone) {
    throw new Error("Falta callerId para guardar el contacto");
  }

  const existingLead = await findLeadByPhone({
    supabase,
    clientId: client.id,
    callerId: normalizedPhone,
  });

  const score = await calculateLeadScore({
    supabase,
    nombre: name || existingLead?.nombre || "",
    telefono: normalizedPhone,
    necesidad: need || existingLead?.necesidad || "",
    ciudad: city || existingLead?.ciudad || "",
  });
  const interest = toLeadInterest(score);
  const combinedNotes = [existingLead?.notes, notes, preference]
    .filter(Boolean)
    .join("\n")
    .trim();
  const resumen =
    toTrimmed(summary) ||
    [
      name || existingLead?.nombre || "Contacto sin nombre",
      need || existingLead?.necesidad || "",
      city || existingLead?.ciudad || "",
    ]
      .filter(Boolean)
      .join(" · ");

  const tags = mergeTags(
    Array.isArray(existingLead?.tags) ? existingLead.tags : [],
    ["llamada_ia", "elevenlabs_voice", interest ? `interes:${interest}` : null],
    need ? ["necesidad_detectada"] : [],
    city ? [`ciudad:${city}`] : [],
    preference ? [`preferencia:${preference}`] : []
  );

  const nowIso = new Date().toISOString();
  let lead = existingLead;
  let created = false;

  if (existingLead?.id) {
    const updates = {
      nombre: name || existingLead.nombre,
      email: email || existingLead.email,
      ciudad: city || existingLead.ciudad,
      necesidad: need || existingLead.necesidad,
      owner: owner || existingLead.owner,
      status:
        status ||
        (String(existingLead.status || "").toLowerCase() === "new"
          ? "contacted"
          : existingLead.status),
      score: Math.max(Number(existingLead.score || 0), score),
      interes: interest,
      notes: combinedNotes || existingLead.notes,
      resumen,
      tags,
      ultima_accion: "Contacto actualizado por llamada ElevenLabs",
      proxima_accion: "Revisar resumen de llamada y siguiente paso",
      last_contacted_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", existingLead.id)
      .eq("client_id", client.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "No se pudo actualizar el contacto");
    }

    lead = data;
  } else {
    const payload = {
      client_id: client.id,
      nombre: name || "Contacto de llamada",
      telefono: normalizedPhone,
      email: email || null,
      ciudad: city || null,
      necesidad: need || null,
      origen: `llamada_${client.id}`,
      fuente: "llamada_ia",
      score,
      status: status || "new",
      tags,
      ultima_accion: "Contacto capturado por ElevenLabs",
      proxima_accion: "Contactar al contacto lo antes posible",
      interes: interest,
      resumen,
      notes: combinedNotes || null,
      owner: owner || null,
    };

    const { data, error } = await supabase
      .from("leads")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "No se pudo crear el contacto");
    }

    lead = data;
    created = true;
  }

  await safeInsertLeadEvent(supabase, {
    leadId: lead.id,
    clientId: client.id,
    phone: normalizedPhone,
    type: created ? "lead_created" : "lead_updated",
    title: created
      ? "Contacto capturado por ElevenLabs"
      : "Contacto actualizado por ElevenLabs",
    description:
      summary ||
      `Llamada ${created ? "capturada" : "actualizada"} por voz IA. Nombre: ${lead.nombre || "-"} · Necesidad: ${lead.necesidad || "-"}`,
    meta: {
      provider: "elevenlabs",
      conversationId: toTrimmed(conversationId),
      calledNumber: normalizePhone(calledNumber),
      callerId: normalizedPhone,
      created,
    },
  });

  await safeInsertAuditLog(supabase, {
    clientId: client.id,
    entityType: "lead",
    entityId: lead.id,
    action: created ? "elevenlabs_lead_created" : "elevenlabs_lead_updated",
    actor: "elevenlabs",
    changes: {
      provider: "elevenlabs",
      conversationId: toTrimmed(conversationId),
      callerId: normalizedPhone,
      calledNumber: normalizePhone(calledNumber),
      status: lead.status,
    },
  });

  try {
    await saveNextBestAction({
      supabase,
      leadId: lead.id,
      clientId: client.id,
      brandName: client.brand_name || client.name || "Nesped",
      actor: "elevenlabs",
    });
  } catch {}

  /* Lo que la persona ha dicho EN ESTA llamada, tal cual, sin mezclar con
     lo que ya se sabía. Es lo que va en el correo de la llamada: la empresa
     pidió que cada aviso lleve sólo lo dicho esa vez, aunque el contacto sea
     conocido. Se guarda como evento atado a la conversación. */
  const dichoAhora = Object.fromEntries(
    Object.entries({
      nombre: name,
      email,
      telefono: phone,
      ciudad: city,
      direccion: address,
      necesidad: need,
      preferencia: preference,
      resumen: summary,
      notas: notes,
    })
      .map(([k, v]) => [k, toTrimmed(v)]).filter(([, v]) => v),
  );
  if (Object.keys(dichoAhora).length && toTrimmed(conversationId)) {
    const { error: errorDicho } = await supabase.from("lead_events").insert({
      lead_id: lead.id, client_id: client.id, type: "datos_de_llamada",
      title: "Datos dados en la llamada",
      description: Object.entries(dichoAhora).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 2000),
      meta: { ...dichoAhora, conversation_id: toTrimmed(conversationId) },
    });
    if (errorDicho) logEvent("warn", "elevenlabs.datos_de_llamada_no_guardados", { error: errorDicho.message });
  }

  return {
    response: {
      clientId: client.id,
      companyName: client.name || client.brand_name || "Nesped",
      brandName: client.brand_name || client.name || "Nesped",
      callerId: normalizedPhone,
      calledNumber: normalizePhone(calledNumber || client.twilio_number || ""),
      conversationId: toTrimmed(conversationId),
      leadId: lead.id,
      leadName: name || lead.nombre || "",
      leadNeed: need || "",
      leadStatus: "",
      leadOwner: "",
      leadSummary: [name || lead.nombre || "", need, city].filter(Boolean).join(" · "),
      created,
    },
  };
}

export function formatElevenLabsTranscript(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const role = String(entry?.role || "").toLowerCase();
      const speaker =
        role === "agent" ? "IA" : role === "user" ? "Cliente" : "Sistema";
      const message = toTrimmed(entry?.message || "");
      return message ? `${speaker}: ${message}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function resolveLeadIdFromDynamicVars(dynamicVars = {}) {
  return toTrimmed(
    dynamicVars.lead_id || dynamicVars.leadId || dynamicVars.lead || ""
  );
}

function resolveClientIdFromDynamicVars(dynamicVars = {}) {
  return toTrimmed(
    dynamicVars.client_id || dynamicVars.clientId || dynamicVars.client || ""
  );
}

export async function persistElevenLabsCall({
  supabase = getSupabase(),
  payload,
} = {}) {
  const eventType = toTrimmed(payload?.type);
  if (eventType && eventType !== "post_call_transcription") {
    return { skipped: true, reason: `Evento no soportado: ${eventType}` };
  }

  const data = payload?.data || {};
  const dynamicVars =
    data?.conversation_initiation_client_data?.dynamic_variables || {};
  const clientId = resolveClientIdFromDynamicVars(dynamicVars);
  /* El teléfono de quien llama y el número marcado. ElevenLabs los manda
     como variables de sistema (system__caller_id / system__called_number)
     y también en metadata.phone_call; sin ellos, la llamada se guardaba sin
     from_number, no se le encontraba contacto y contaba como "sin captar". */
  const telefonia = data?.metadata?.phone_call || {};
  const callerId = normalizePhone(
    dynamicVars.caller_id || dynamicVars.callerId || dynamicVars.system__caller_id || telefonia.external_number || ""
  );
  const calledNumber = normalizePhone(
    dynamicVars.called_number || dynamicVars.calledNumber || dynamicVars.system__called_number || telefonia.agent_number || ""
  );
  const conversationId = toTrimmed(data?.conversation_id || "");

  const client = await resolveClientByVoiceNumber({
    supabase,
    clientId,
    calledNumber,
  });

  if (!client?.id) {
    /* Una conversación sin empresa y sin teléfono es una prueba desde el
       panel de ElevenLabs ("Vista previa"): no es una llamada de nadie y no
       hay dónde guardarla. Se descarta sin reintentos en vez de fallar
       cinco veces en la cola. */
    if (!calledNumber && !telefonia.agent_number) {
      return { skipped: true, reason: "Conversación sin empresa ni teléfono (prueba desde el panel)" };
    }
    throw new Error("No se pudo resolver el cliente al persistir la llamada");
  }

  const leadId = resolveLeadIdFromDynamicVars(dynamicVars);
  const lead =
    (leadId
      ? (
          await supabase
            .from("leads")
            .select("*")
            .eq("id", leadId)
            .eq("client_id", client.id)
            .maybeSingle()
        ).data
      : null) ||
    (await findLeadByPhone({
      supabase,
      clientId: client.id,
      callerId,
    }));

  /* Si el contacto ya existía antes de esta llamada: decide si es 'nuevo'. */
  const existiaAntes = Boolean(lead?.id && lead?.created_at && Date.now() - new Date(lead.created_at).getTime() > 5 * 60 * 1000);
  const transcript = formatElevenLabsTranscript(data?.transcript || []);
  const summary =
    toTrimmed(data?.analysis?.transcript_summary || "") ||
    toTrimmed(data?.summary || "") ||
    "Llamada atendida con ElevenLabs";
  const durationSeconds = Number(data?.metadata?.call_duration_secs || 0) || 0;
  /* Sólo cuenta el contacto que se ha encontrado EN ESTA EMPRESA. El
     lead_id que viene en las variables dinámicas lo puso el webhook de
     inicio y puede ser de otra empresa si el número cambió de dueño entre
     medias; usarlo a ciegas colgaba eventos de una empresa a un contacto de
     otra. */
  const idContacto = lead?.id || null;
  const leadCaptured = Boolean(idContacto);
  const normalizedConversationId = conversationId || `elevenlabs-${Date.now()}`;
  const baseCallPayload = {
    client_id: client.id,
    lead_id: idContacto,
    call_sid: normalizedConversationId,
    from_number: callerId,
    to_number: calledNumber || normalizePhone(client.twilio_number || ""),
    status:
      String(data?.status || "").toLowerCase() === "done"
        ? "completed"
        : toTrimmed(data?.status || "completed"),
    summary,
    transcript,
    lead_captured: leadCaptured,
    duration_seconds: durationSeconds,
    ai_spoke: true,
    call_outcome: leadCaptured
      ? "lead_captured"
      : toTrimmed(data?.analysis?.call_successful || "") === "success"
        ? "completed_without_lead"
        : "call_incomplete",
    detected_intent:
      toTrimmed(dynamicVars.lead_need || "") ||
      "consulta",
    summary_long: [
      summary,
      data?.metadata?.termination_reason
        ? `Motivo de cierre: ${data.metadata.termination_reason}`
        : null,
      "Proveedor de voz: ElevenLabs",
    ]
      .filter(Boolean)
      .join("\n\n"),
    recording_url: null,
  };

  /* Una sola escritura atómica en vez de buscar-y-luego-insertar.

     Lo de antes —mirar si la llamada existía y, si no, insertarla— dejaba
     una ventana: dos entregas del mismo webhook a la vez pasaban las dos la
     comprobación y metían dos filas. ElevenLabs reintenta, y reintenta
     rápido. Con el índice único (client_id, call_sid) la segunda entrega no
     puede duplicar la fila.

     NO se usa upsert con onConflict: el índice es parcial (where call_sid
     is not null) y PostgREST no lo encuentra para ON CONFLICT, así que el
     upsert fallaba SIEMPRE con "no unique or exclusion constraint" y ninguna
     llamada real llegó a guardarse. Se mira si existe y se actualiza o se
     inserta; si dos entregas insertan a la vez, la segunda choca con el
     índice, se reintenta y encuentra la fila. */
  const { data: existente, error: buscarError } = await supabase
    .from("calls")
    .select("id")
    .eq("client_id", client.id)
    .eq("call_sid", normalizedConversationId)
    .maybeSingle();
  if (buscarError) throw new Error(buscarError.message || "No se pudo comprobar la llamada");

  const { error: guardarError } = existente
    ? await supabase.from("calls").update(baseCallPayload).eq("id", existente.id).eq("client_id", client.id)
    : await supabase.from("calls").insert(baseCallPayload);

  if (guardarError) {
    throw new Error(guardarError.message || "No se pudo guardar la llamada");
  }

  /* Y lo que viene después —eventos del contacto, auditoría, consumo— sólo
     una vez por conversación. Es el mismo reclamo atómico que usa el webhook
     de Stripe: el primero que llega se lo queda; los reintentos ven la
     llamada guardada y no vuelven a anotar consumo ni a repetir el evento.
     Sin identificador de conversación no hay forma de reclamar nada, y se
     procesa como hasta ahora. */
  if (conversationId) {
    const { data: primeraVez, error: reclamoError } = await supabase.rpc("reclamar_webhook", {
      p_proveedor: "elevenlabs",
      p_evento_id: conversationId,
    });
    if (reclamoError) {
      throw new Error(reclamoError.message || "No se pudo reclamar la conversación");
    }
    if (primeraVez === false) {
      return { success: true, duplicated: true, conversationId };
    }
  }

  if (lead?.id) {
    await supabase
      .from("leads")
      .update({
        last_contacted_at: new Date().toISOString(),
        ultima_accion: "Llamada atendida por ElevenLabs",
        resumen: lead.resumen || summary,
      })
      .eq("id", lead.id)
      .eq("client_id", client.id);
  }

  await safeInsertLeadEvent(supabase, {
    leadId: idContacto,
    clientId: client.id,
    phone: callerId,
    type: "voice_call_logged",
    title: "Llamada registrada desde ElevenLabs",
    description: summary,
    meta: {
      provider: "elevenlabs",
      conversationId: normalizedConversationId,
      durationSeconds,
      leadCaptured,
    },
  });

  /* Consumo de la empresa.
  
     Esto faltaba, y faltaba en silencio. Lo anotaba el servidor de voz cuando
     la conversación la llevábamos nosotros; al pasar a ElevenLabs, el sitio
     donde termina una llamada cambió y la contabilidad se quedó atrás. El
     panel de consumo y las cuotas del plan habrían marcado cero para siempre
     mientras llegaba la factura de ElevenLabs, que es exactamente el fallo que
     ya ocurrió una vez con el prefijo del contador de caracteres.
  
     Va con su propio try: si la contabilidad falla, la llamada tiene que
     quedar guardada igual. Es preferible perder una anotación de consumo que
     perder el registro de una conversación con un cliente. */
  try {
    await supabase.rpc("anotar_consumo", {
      p_client_id: client.id,
      p_llamadas: 1,
      p_segundos_voz: durationSeconds,
      /* Lo que factura la voz sintética es el texto que ha dicho el agente, no
         la duración: un silencio dura y no cuesta. */
      p_caracteres_voz: caracteresDelAgente(
        (data?.transcript || []).map((linea) =>
          String(linea?.role || "").toLowerCase() === "agent"
            ? `${ETIQUETA_AGENTE}${linea?.message || ""}`
            : String(linea?.message || "")
        )
      ),
    });
  } catch (err) {
    /* Se anota y se sigue. Que no se vea sería peor que que falle. */
    logErrorSeguro("elevenlabs.usage_write_failed", err);
  }

  await safeInsertAuditLog(supabase, {
    clientId: client.id,
    entityType: "call",
    entityId: normalizedConversationId,
    action: "elevenlabs_call_persisted",
    actor: "elevenlabs",
    changes: {
      provider: "elevenlabs",
      leadId: idContacto,
      durationSeconds,
      leadCaptured,
      status: baseCallPayload.status,
    },
  });

  /* La grabación: ElevenLabs no la manda en el webhook; la cola la baja de
     su API y la guarda en el almacenamiento propio, una vez por conversación. */
  if (conversationId) {
    void encolar({
      tipo: "copiar_grabacion",
      clientId: client.id,
      datos: { callSid: normalizedConversationId },
      clave: `copiar_grabacion:${normalizedConversationId}`,
      unaSolaVez: true,
    }).catch((err) => logErrorSeguro("elevenlabs.recording_copy_enqueue_failed", err));
  }

  /* La clasificación por departamento y los automatismos van por la cola:
     una llamada a OpenAI aquí dentro retrasaría la respuesta a ElevenLabs.
     Se manda el resumen de la llamada como texto extra, y si el contacto se
     creó en esta llamada, lead.nuevo también dispara. */
  if (idContacto) {
    void pedirClasificacion({
      clientId: client.id,
      leadId: idContacto,
      nuevo: !existiaAntes,
      textoExtra: [summary, transcript ? String(transcript).slice(0, 3000) : ""],
      callSid: normalizedConversationId,
      aislarLlamada: true,
    });
  }

  /* La llamada entera, por correo, a quien tenga copia de todo. Se pide
     con un minuto de margen para que la clasificación llegue antes y el
     correo lleve el departamento. */
  if (conversationId) {
    void encolar({
      tipo: "notificar_llamada",
      clientId: client.id,
      datos: { callSid: normalizedConversationId },
      clave: `notificar_llamada:${normalizedConversationId}`,
      unaSolaVez: true,
      noAntesDe: new Date(Date.now() + 60_000).toISOString(),
    }).catch((err) => logErrorSeguro("elevenlabs.call_notification_enqueue_failed", err));
  }

  /* Y se le cuenta al sistema del cliente, si tiene uno escuchando. */
  void emitirWebhook({
    clientId: client.id,
    evento: EVENTOS.LLAMADA_TERMINADA,
    datos: {
      conversation_id: normalizedConversationId,
      lead_id: idContacto,
      lead_captured: leadCaptured,
      duration_seconds: durationSeconds,
      status: baseCallPayload.status,
      summary: baseCallPayload.summary || null,
      from_number: baseCallPayload.from_number || null,
    },
  });

  return {
    success: true,
    clientId: client.id,
    leadId: idContacto || "",
    conversationId: normalizedConversationId,
  };
}
