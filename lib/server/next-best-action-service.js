import OpenAI from "openai";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { getNextBestActionRules } from "@/lib/next-best-action";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const ALLOWED_ACTIONS = new Set(["call", "whatsapp", "sms", "wait"]);
const ALLOWED_PRIORITIES = new Set(["high", "medium", "low", "none"]);

export function createAdminSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function resolveAppUrl() {
  return (
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function predictCloseProbability(lead) {
  const score = Number(lead?.score || 0);
  const status = String(lead?.status || "new");

  let base = score;

  if (status === "contacted") base += 10;
  if (status === "qualified") base += 20;
  if (status === "won") base = 100;
  if (status === "lost") base = 0;

  if (lead?.followup_sms_sent) base += 5;
  if (lead?.next_step_ai) base += 5;
  if (lead?.owner) base += 5;

  if (base > 100) return 100;
  if (base < 0) return 0;
  return base;
}

function normalizePhone(value) {
  if (!value) return "";
  return String(value).replace(/\s+/g, "").trim();
}

function normalizePhoneForWhatsApp(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function getTwilioSmsClientConfig() {
  const accountSid =
    process.env.ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const authToken =
    process.env.AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  const from =
    process.env.TWILIO_NUMERO || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("Faltan credenciales de Twilio");
  }

  return {
    client: twilio(accountSid, authToken),
    from,
  };
}

async function createAuditLog(supabase, { clientId, leadId, action, meta = {} }) {
  await supabase.from("audit_logs").insert({
    client_id: clientId,
    action,
    entity_type: "lead",
    entity_id: leadId,
    meta,
    created_at: new Date().toISOString(),
  });
}

async function createLeadEvent(
  supabase,
  { clientId, leadId, type, title, description, meta = {} }
) {
  await supabase.from("lead_events").insert({
    client_id: clientId,
    lead_id: leadId,
    type,
    title,
    description,
    meta,
    created_at: new Date().toISOString(),
  });
}

async function getLeadOrThrow({ supabase, leadId, clientId }) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("client_id", clientId)
    .single();

  if (error || !lead) {
    throw new Error(error?.message || "Lead no encontrado");
  }

  return {
    ...lead,
    predicted_close_probability:
      lead.predicted_close_probability ?? predictCloseProbability(lead),
  };
}

function sanitizeLlmRecommendation(parsed, fallback) {
  const action = ALLOWED_ACTIONS.has(parsed?.action)
    ? parsed.action
    : fallback.action;
  const priority = ALLOWED_PRIORITIES.has(parsed?.priority)
    ? parsed.priority
    : fallback.priority;

  return {
    ...fallback,
    action,
    reason: parsed?.reason || fallback.reason,
    message: parsed?.message || fallback.message,
    priority,
    source: "llm+rules",
  };
}

export async function generateNextBestActionLlmRecommendation({
  lead,
  brandName = "nuestro equipo",
  fallback,
}) {
  if (!openai) return fallback;

  const prompt = `
Eres un experto en cierre de ventas para un CRM SaaS.

Tu trabajo es decidir la mejor siguiente acción para maximizar la probabilidad de cierre.

Marca de la empresa: ${brandName}

Datos del lead:
- Nombre: ${lead.nombre || ""}
- Teléfono: ${lead.telefono || ""}
- Ciudad: ${lead.ciudad || ""}
- Necesidad: ${lead.necesidad || ""}
- Estado del pipeline: ${lead.status || ""}
- Interés: ${lead.interes || ""}
- Score: ${lead.score || 0}
- Probabilidad de cierre: ${lead.predicted_close_probability || 0}
- Última acción: ${lead.ultima_accion || ""}
- Próxima acción actual: ${lead.proxima_accion || ""}
- Notas: ${lead.notes || ""}
- Valor estimado: ${lead.valor_estimado || 0}
- Último contacto: ${
    lead.last_contact_at || lead.last_contacted_at || lead.updated_at || lead.created_at || ""
  }
- Responsable: ${lead.owner || ""}

Debes elegir SOLO una acción:
- call
- whatsapp
- sms
- wait

Reglas:
- Sé agresivo comercialmente pero no pesado.
- Si el lead está caliente, prioriza call o whatsapp.
- Si el lead está frío, usa sms o wait.
- El mensaje debe ser corto, vendedor y natural.
- No añadas explicaciones fuera del JSON.

Responde SOLO con JSON válido con este formato:
{
  "action": "call | whatsapp | sms | wait",
  "reason": "explicación breve",
  "message": "mensaje listo para enviar",
  "priority": "high | medium | low | none"
}
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
    });

    const text = response.output_text?.trim() || "{}";
    const parsed = JSON.parse(text);
    return sanitizeLlmRecommendation(parsed, fallback);
  } catch (error) {
    console.error("LLM NBA fallback a reglas:", error);
    return fallback;
  }
}

export async function saveNextBestAction({
  supabase = createAdminSupabase(),
  leadId,
  clientId,
  brandName = "nuestro equipo",
  useAI = true,
  actor = "system",
}) {
  if (!leadId || !clientId) {
    throw new Error("Faltan leadId o clientId");
  }

  const lead = await getLeadOrThrow({ supabase, leadId, clientId });
  const rulesRecommendation = getNextBestActionRules(lead, brandName);
  const finalRecommendation = useAI
    ? await generateNextBestActionLlmRecommendation({
        lead,
        brandName,
        fallback: rulesRecommendation,
      })
    : rulesRecommendation;

  const updatePayload = {
    next_action: finalRecommendation.action,
    next_action_reason: finalRecommendation.reason,
    next_action_message: finalRecommendation.message,
    next_action_priority: finalRecommendation.priority,
    next_action_updated_at: new Date().toISOString(),
  };

  const { data: updatedLead, error: updateError } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("client_id", clientId)
    .select("*")
    .single();

  if (updateError || !updatedLead) {
    throw new Error(updateError?.message || "No se pudo actualizar el lead");
  }

  await Promise.all([
    createAuditLog(supabase, {
      clientId,
      leadId,
      action: "next_best_action_saved",
      meta: {
        ...finalRecommendation,
        actor,
      },
    }),
    createLeadEvent(supabase, {
      clientId,
      leadId,
      type: "next_best_action_updated",
      title: "Acción recomendada actualizada",
      description: `Nueva acción: ${finalRecommendation.action}. Motivo: ${finalRecommendation.reason}`,
      meta: {
        action: finalRecommendation.action,
        priority: finalRecommendation.priority,
        execution_mode: finalRecommendation.execution_mode || "manual",
        action_score: finalRecommendation.action_score || 0,
        source: finalRecommendation.source || "rules",
        actor,
      },
    }),
  ]);

  return {
    lead: updatedLead,
    recommendation: finalRecommendation,
  };
}

export async function executeNextBestAction({
  supabase = createAdminSupabase(),
  leadId,
  clientId,
  actor = "system",
}) {
  if (!leadId || !clientId) {
    throw new Error("Faltan leadId o clientId");
  }

  const lead = await getLeadOrThrow({ supabase, leadId, clientId });
  const action = lead.next_action;
  const message = lead.next_action_message || "";
  const nowIso = new Date().toISOString();

  if (!action || action === "wait") {
    return {
      success: false,
      message: "Este lead no tiene una acción ejecutable.",
    };
  }

  if (action === "sms") {
    const cleanTo = normalizePhone(lead.telefono);
    if (!cleanTo) {
      throw new Error("Teléfono no válido");
    }

    const { client, from } = getTwilioSmsClientConfig();
    const sms = await client.messages.create({
      body: String(message).trim(),
      from,
      to: cleanTo,
    });

    await supabase
      .from("leads")
      .update({
        followup_sms_sent: true,
        last_contact_at: nowIso,
        last_contacted_at: nowIso,
        ultima_accion: "SMS enviado desde acción recomendada",
      })
      .eq("id", lead.id)
      .eq("client_id", clientId);

    await Promise.all([
      createAuditLog(supabase, {
        clientId,
        leadId,
        action: "next_best_action_executed_sms",
        meta: { message, sid: sms.sid, actor },
      }),
      createLeadEvent(supabase, {
        clientId,
        leadId,
        type: "next_best_action_executed",
        title: "SMS enviado",
        description: message,
        meta: { source: "next_best_action", sid: sms.sid, actor },
      }),
    ]);

    return { success: true, mode: "sms", sid: sms.sid };
  }

  if (action === "whatsapp") {
    const phone = normalizePhoneForWhatsApp(lead.telefono);
    if (!phone) {
      throw new Error("Teléfono no válido para WhatsApp");
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    await supabase
      .from("leads")
      .update({
        last_contact_at: nowIso,
        last_contacted_at: nowIso,
        ultima_accion: "WhatsApp preparado desde acción recomendada",
      })
      .eq("id", lead.id)
      .eq("client_id", clientId);

    await Promise.all([
      createAuditLog(supabase, {
        clientId,
        leadId,
        action: "next_best_action_executed_whatsapp",
        meta: { message, whatsappUrl: url, actor },
      }),
      createLeadEvent(supabase, {
        clientId,
        leadId,
        type: "next_best_action_executed",
        title: "WhatsApp preparado",
        description: message,
        meta: { source: "next_best_action", whatsappUrl: url, actor },
      }),
    ]);

    return { success: true, mode: "whatsapp", url };
  }

  if (action === "call") {
    const appUrl = resolveAppUrl();
    const callRes = await fetch(`${appUrl}/api/demo-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        telefono: lead.telefono,
        client_id: clientId,
        lead_id: lead.id,
      }),
    });

    const callJson = await callRes.json();
    if (!callJson.success) {
      throw new Error(callJson.message || "No se pudo lanzar la llamada");
    }

    await supabase
      .from("leads")
      .update({
        last_contact_at: nowIso,
        last_contacted_at: nowIso,
        ultima_accion: "Llamada lanzada desde acción recomendada",
      })
      .eq("id", lead.id)
      .eq("client_id", clientId);

    await Promise.all([
      createAuditLog(supabase, {
        clientId,
        leadId,
        action: "next_best_action_executed_call",
        meta: { telefono: lead.telefono, actor },
      }),
      createLeadEvent(supabase, {
        clientId,
        leadId,
        type: "next_best_action_executed",
        title: "Llamada lanzada",
        description: "Se ha iniciado una llamada desde la acción recomendada.",
        meta: { source: "next_best_action", actor },
      }),
    ]);

    return {
      success: true,
      mode: "call",
      callSid: callJson.callSid || null,
    };
  }

  return {
    success: false,
    message: "Acción no soportada.",
  };
}
