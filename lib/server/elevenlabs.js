import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";

function toTrimmed(value = "") {
  return String(value || "").trim();
}

export function normalizePhone(value = "") {
  return toTrimmed(value).replace(/[^\d+]/g, "");
}

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
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    telnyxNumber: normalizePhone(process.env.TELNYX_PHONE_NUMBER || ""),
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
      config.telnyxNumber &&
      config.baseUrl
  );
}

export function isAuthorizedElevenLabsWebhook(req) {
  const expectedSecret = getElevenLabsHybridConfig().webhookSecret;
  if (!expectedSecret) return false;

  const url = new URL(req.url);
  const receivedSecret =
    toTrimmed(url.searchParams.get("secret")) ||
    toTrimmed(req.headers.get("x-nesped-provider-secret")) ||
    "";

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
  toleranceSeconds = 30 * 60,
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

function buildLeadSummary(lead) {
  if (!lead) {
    return "Llamada nueva sin lead previo. Captura nombre, necesidad y zona si hace falta.";
  }

  const parts = [
    lead.nombre ? `Lead: ${lead.nombre}` : "Lead existente",
    lead.necesidad ? `Necesidad: ${lead.necesidad}` : null,
    lead.status ? `Estado: ${lead.status}` : null,
    lead.owner ? `Owner: ${lead.owner}` : null,
    lead.ciudad ? `Ciudad: ${lead.ciudad}` : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function buildCallObjective({ lead, brandName }) {
  if (!lead) {
    return `Atiende como ${brandName}. Detecta si es lead nuevo, resuelve dudas de primer nivel y captura nombre, necesidad y ciudad antes de cerrar.`;
  }

  if (String(lead.status || "").toLowerCase() === "won") {
    return `Atiende como ${brandName}. Esta llamada es de seguimiento sobre un cliente ya ganado: prioriza soporte, claridad y siguiente paso.`;
  }

  return `Atiende como ${brandName}. Continua la conversacion comercial del lead, valida necesidad, resuelve objeciones y cierra el siguiente paso.`;
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
    throw new Error(error.message || "No se pudieron cargar leads");
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
  const richPayload = {
    lead_id: leadId,
    client_id: clientId,
    type,
    title,
    description,
    meta,
    created_at: new Date().toISOString(),
  };

  const richRes = await supabase.from("lead_events").insert(richPayload);
  if (!richRes.error) return;

  const fallbackPayload = {
    lead_id: leadId,
    phone: normalizePhone(phone),
    type,
    message: JSON.stringify({
      title,
      description,
      meta,
    }),
  };

  const fallbackRes = await supabase.from("lead_events").insert(fallbackPayload);
  if (fallbackRes.error) {
    throw new Error(
      fallbackRes.error.message || richRes.error.message || "No se pudo guardar el evento"
    );
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
      leadNeed: lead?.necesidad || "",
      leadStatus: lead?.status || "new",
      leadOwner: lead?.owner || "",
      leadSummary: buildLeadSummary(lead),
      callObjective: buildCallObjective({ lead, brandName }),
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
  city = "",
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
    throw new Error("No se pudo resolver el cliente para guardar el lead");
  }

  const normalizedPhone = normalizePhone(callerId);
  if (!normalizedPhone) {
    throw new Error("Falta callerId para guardar el lead");
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
      name || existingLead?.nombre || "Lead sin nombre",
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
      ultima_accion: "Lead actualizado por llamada ElevenLabs",
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
      throw new Error(error?.message || "No se pudo actualizar el lead");
    }

    lead = data;
  } else {
    const payload = {
      client_id: client.id,
      nombre: name || "Lead de llamada",
      telefono: normalizedPhone,
      ciudad: city || null,
      necesidad: need || null,
      origen: `llamada_${client.id}`,
      fuente: "llamada_ia",
      score,
      status: status || "new",
      tags,
      ultima_accion: "Lead capturado por ElevenLabs",
      proxima_accion: "Contactar al lead lo antes posible",
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
      throw new Error(error?.message || "No se pudo crear el lead");
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
      ? "Lead capturado por ElevenLabs"
      : "Lead actualizado por ElevenLabs",
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

  return {
    response: {
      clientId: client.id,
      companyName: client.name || client.brand_name || "Nesped",
      brandName: client.brand_name || client.name || "Nesped",
      callerId: normalizedPhone,
      calledNumber: normalizePhone(calledNumber || client.twilio_number || ""),
      conversationId: toTrimmed(conversationId),
      leadId: lead.id,
      leadName: lead.nombre || "",
      leadNeed: lead.necesidad || "",
      leadStatus: lead.status || "new",
      leadOwner: lead.owner || "",
      leadSummary: buildLeadSummary(lead),
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
  const callerId = normalizePhone(
    dynamicVars.caller_id || dynamicVars.callerId || ""
  );
  const calledNumber = normalizePhone(
    dynamicVars.called_number || dynamicVars.calledNumber || ""
  );
  const conversationId = toTrimmed(data?.conversation_id || "");

  const client = await resolveClientByVoiceNumber({
    supabase,
    clientId,
    calledNumber,
  });

  if (!client?.id) {
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

  const transcript = formatElevenLabsTranscript(data?.transcript || []);
  const summary =
    toTrimmed(data?.analysis?.transcript_summary || "") ||
    toTrimmed(data?.summary || "") ||
    "Llamada atendida con ElevenLabs";
  const durationSeconds = Number(data?.metadata?.call_duration_secs || 0) || 0;
  const leadCaptured = Boolean(lead?.id || leadId);
  const normalizedConversationId = conversationId || `elevenlabs-${Date.now()}`;
  const baseCallPayload = {
    client_id: client.id,
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
      toTrimmed(dynamicVars.lead_need || dynamicVars.call_objective || "") ||
      toTrimmed(lead?.necesidad || "") ||
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

  const existingCallRes = await supabase
    .from("calls")
    .select("id")
    .eq("client_id", client.id)
    .eq("call_sid", normalizedConversationId)
    .maybeSingle();

  if (existingCallRes.error) {
    throw new Error(
      existingCallRes.error.message || "No se pudo revisar la llamada existente"
    );
  }

  if (existingCallRes.data?.id) {
    const { error } = await supabase
      .from("calls")
      .update(baseCallPayload)
      .eq("id", existingCallRes.data.id);

    if (error) {
      throw new Error(error.message || "No se pudo actualizar la llamada");
    }
  } else {
    const { error } = await supabase.from("calls").insert(baseCallPayload);
    if (error) {
      throw new Error(error.message || "No se pudo guardar la llamada");
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
    leadId: lead?.id || leadId || null,
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

  await safeInsertAuditLog(supabase, {
    clientId: client.id,
    entityType: "call",
    entityId: normalizedConversationId,
    action: "elevenlabs_call_persisted",
    actor: "elevenlabs",
    changes: {
      provider: "elevenlabs",
      leadId: lead?.id || leadId || null,
      durationSeconds,
      leadCaptured,
      status: baseCallPayload.status,
    },
  });

  return {
    success: true,
    clientId: client.id,
    leadId: lead?.id || leadId || "",
    conversationId: normalizedConversationId,
  };
}
