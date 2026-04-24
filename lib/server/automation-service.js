import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";

const ONBOARDING_URL = process.env.ONBOARDING_URL || "";
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP || "";
const WELCOME_VIDEO_URL = process.env.WELCOME_VIDEO_URL || "";
const BOOKING_URL = process.env.BOOKING_URL || "";
const VOICE_CALL_WEBHOOK_URL = process.env.VOICE_CALL_WEBHOOK_URL || "";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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

  return Math.max(0, Math.min(100, base));
}

export function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "");
}

function normalizeWhatsAppAddress(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("whatsapp:")
    ? normalized
    : `whatsapp:${normalizePhone(normalized)}`;
}

function hoursSince(date) {
  return (Date.now() - new Date(date).getTime()) / 1000 / 60 / 60;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hasEvent(history, type) {
  return (history || []).some(
    (event) => String(event?.type || "").toLowerCase() === String(type).toLowerCase()
  );
}

function hasRecentEvent(history, types = [], maxHours = 24) {
  return (history || []).some((event) => {
    const type = String(event?.type || "").toLowerCase();
    if (!types.map((t) => String(t).toLowerCase()).includes(type)) return false;
    return hoursSince(event.created_at) <= maxHours;
  });
}

function hasAnyEvent(history, types = []) {
  return (history || []).some((event) =>
    types.map((t) => String(t).toLowerCase()).includes(String(event?.type || "").toLowerCase())
  );
}

function getQualifiedPushMessage(lead, paymentLink) {
  const name = lead?.nombre || "";
  if (paymentLink) {
    return `Hola ${name}, por lo que hemos visto encajas bien. Si quieres dejarlo resuelto ahora, aquí tienes el enlace directo:\n${paymentLink}\n\nSi prefieres verlo antes, reserva aquí:\n${BOOKING_URL}`;
  }

  return `Hola ${name}, estás en buen punto para avanzar. Si quieres, lo dejamos agendado aquí:\n${BOOKING_URL}`;
}

function getContactedFollowupMessage(lead) {
  const name = lead?.nombre || "";
  return `Hola ${name}, te escribo para no dejar esto en el aire. Si te encaja, lo vemos aquí:\n${BOOKING_URL}`;
}

function getNewLeadMessage(lead) {
  const name = lead?.nombre || "";
  const necesidad = lead?.necesidad || "lo que nos pediste";
  return `Hola ${name}, te escribo para ayudarte con ${necesidad}. Si quieres, te explico por aquí o lo vemos contigo aquí:\n${BOOKING_URL}`;
}

function buildOnboardingMessage(lead, paymentEvent) {
  const name = lead?.nombre || paymentEvent?.customer_name || "";
  const onboardingLine = ONBOARDING_URL
    ? `Aquí tienes tu acceso / onboarding:\n${ONBOARDING_URL}`
    : "Te escribimos en breve con el siguiente paso de activación.";

  const supportLine = SUPPORT_WHATSAPP
    ? `Si necesitas ayuda directa, escríbenos aquí:\n${SUPPORT_WHATSAPP}`
    : "";

  const videoLine = WELCOME_VIDEO_URL
    ? `Te dejo también esta bienvenida rápida:\n${WELCOME_VIDEO_URL}`
    : "";

  return [
    `Hola ${name}, perfecto — ya hemos recibido tu pago ✅`,
    "A partir de aquí empezamos contigo.",
    onboardingLine,
    videoLine,
    supportLine,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function selectPaymentLinkFromLead(lead) {
  const score = Number(lead?.score || 0);
  const prob = Number(lead?.predicted_close_probability || 0);
  const value = Number(lead?.valor_estimado || 0);
  const interes = String(lead?.interes || "").toLowerCase();

  if (prob >= 85 || score >= 85 || value >= 1000 || interes === "alto") {
    return process.env.PAYMENT_PREMIUM || "";
  }

  if (prob >= 60 || score >= 60 || interes === "medio") {
    return process.env.PAYMENT_PRO || "";
  }

  return process.env.PAYMENT_BASIC || "";
}

export async function getAllLeadsForAutomation() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar leads");
  }

  return (data || []).map((lead) => ({
    ...lead,
    predicted_close_probability:
      lead.predicted_close_probability ?? predictCloseProbability(lead),
  }));
}

export async function sendWhatsAppMessage(to, message) {
  const accountSid =
    process.env.ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const authToken =
    process.env.AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("Faltan credenciales de Twilio WhatsApp");
  }

  const client = twilio(accountSid, authToken);
  return client.messages.create({
    from: normalizeWhatsAppAddress(from),
    to: normalizeWhatsAppAddress(to),
    body: message,
  });
}

export async function updateLeadDirect(leadId, changes) {
  const supabase = getSupabase();
  const { error } = await supabase.from("leads").update(changes).eq("id", leadId);
  if (error) {
    throw new Error(error.message || "No se pudo actualizar lead");
  }
}

export async function createReminderDirect(leadId, title, remind_at, assigned_to = "") {
  const supabase = getSupabase();
  await supabase.from("lead_reminders").insert({
    lead_id: leadId,
    title,
    remind_at,
    assigned_to,
  });
}

export async function updateLeadMemoryDirect(leadId, payload) {
  await prisma.leadMemory.upsert({
    where: { lead_id: leadId },
    update: payload,
    create: {
      lead_id: leadId,
      ...payload,
    },
  });
}

export async function createLeadEventDirect({ lead_id, phone, type, message }) {
  return prisma.leadEvent.create({
    data: {
      lead_id: lead_id || null,
      phone: phone || null,
      type,
      message,
    },
  });
}

async function runExternalVoiceCall(lead) {
  if (!VOICE_CALL_WEBHOOK_URL) {
    return {
      success: true,
      queued: true,
      status: "queued",
      result: "queued",
      summary: "Llamada IA en cola (sin proveedor externo configurado).",
      transcript: "",
      duration_seconds: 0,
    };
  }

  const res = await fetch(VOICE_CALL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      leadId: lead.id,
      phone: normalizePhone(lead.telefono || ""),
      name: lead.nombre || "",
      need: lead.necesidad || "",
      score: Number(lead.score || 0),
      probability: Number(lead.predicted_close_probability || 0),
      owner: lead.owner || "",
    }),
  });

  return await res.json();
}

export async function runOnboardingAutomation() {
  const leads = await getAllLeadsForAutomation();
  const processed = [];
  const failed = [];

  const paymentEvents = await prisma.leadEvent.findMany({
    where: { type: "payment_completed" },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  for (const payment of paymentEvents) {
    try {
      const parsed = safeParseJson(payment.message || "{}") || {};
      const phone = normalizePhone(payment.phone || parsed.customer_phone || "");
      const leadId = payment.lead_id || "";

      const lead =
        leads.find((item) => {
          if (leadId && item.id === leadId) return true;
          return normalizePhone(item.telefono || "") === phone;
        }) || null;

      if (!lead) continue;

      const history = await prisma.leadEvent.findMany({
        where: {
          OR: [{ lead_id: lead.id }, { phone: normalizePhone(lead.telefono || "") || null }],
        },
        orderBy: { created_at: "desc" },
        take: 50,
      });

      const alreadyOnboarded =
        hasEvent(history, "onboarding_started") ||
        hasEvent(history, "onboarding_welcome_sent");

      if (alreadyOnboarded) continue;

      const onboardingMessage = buildOnboardingMessage(lead, parsed);

      if (lead.telefono) {
        await sendWhatsAppMessage(normalizePhone(lead.telefono), onboardingMessage);
      }

      await createLeadEventDirect({
        lead_id: lead.id,
        phone: normalizePhone(lead.telefono || ""),
        type: "onboarding_welcome_sent",
        message: onboardingMessage,
      });

      await createLeadEventDirect({
        lead_id: lead.id,
        phone: normalizePhone(lead.telefono || ""),
        type: "onboarding_started",
        message: JSON.stringify({
          source: "payment_completed",
          payment_event_id: payment.id,
        }),
      });

      await updateLeadDirect(lead.id, {
        status: "won",
        next_action: "wait",
        next_action_priority: "baja",
        ultima_accion: "Onboarding automático iniciado tras pago",
        proxima_accion: "Entrega / activación / onboarding",
        notes: [lead.notes || "", "\n[ONBOARDING] Cliente activado automáticamente tras pago."].join(" ").trim(),
      });

      const remindAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      await createReminderDirect(
        lead.id,
        "Revisar onboarding de cliente nuevo",
        remindAt,
        lead.owner || ""
      );

      processed.push({ leadId: lead.id, phone: lead.telefono || "" });
    } catch (err) {
      console.error(err);
      failed.push({ paymentId: payment.id });
    }
  }

  return { success: true, processed: processed.length, failed: failed.length, data: processed };
}

export async function runFunnelAutomation() {
  const leads = await getAllLeadsForAutomation();
  const processed = [];
  const failed = [];

  for (const lead of leads) {
    try {
      const leadId = lead?.id;
      const phone = normalizePhone(lead?.telefono || "");
      const status = String(lead?.status || "new").toLowerCase();

      if (!leadId || !phone) continue;
      if (["won", "lost"].includes(status)) continue;

      const history = await prisma.leadEvent.findMany({
        where: { OR: [{ lead_id: leadId }, { phone }] },
        orderBy: { created_at: "desc" },
        take: 50,
      });

      if (status === "new") {
        const alreadyStarted = hasAnyEvent(history, [
          "incoming_whatsapp",
          "ai_reply",
          "ai_reply_with_payment",
          "funnel_new_contact",
        ]);

        if (!alreadyStarted) {
          const message = getNewLeadMessage(lead);
          await sendWhatsAppMessage(phone, message);
          await createLeadEventDirect({ lead_id: leadId, phone, type: "funnel_new_contact", message });
          await updateLeadDirect(leadId, {
            status: "contacted",
            next_action: "whatsapp",
            next_action_priority: "media",
            ultima_accion: "Primer contacto automático del funnel",
            proxima_accion: "Esperar respuesta del lead o continuar seguimiento",
          });
          processed.push({ leadId, stage: "new_to_contacted" });
        }
        continue;
      }

      if (status === "contacted") {
        const hasRecentReply = hasRecentEvent(history, ["incoming_whatsapp"], 24);
        const alreadyFollowed = hasRecentEvent(history, ["funnel_contacted_followup"], 24);
        if (!hasRecentReply && !alreadyFollowed) {
          const message = getContactedFollowupMessage(lead);
          await sendWhatsAppMessage(phone, message);
          await createLeadEventDirect({ lead_id: leadId, phone, type: "funnel_contacted_followup", message });
          await updateLeadDirect(leadId, {
            next_action: "whatsapp",
            next_action_priority: "media",
            ultima_accion: "Seguimiento automático en etapa contacted",
            proxima_accion: "Esperar respuesta o recalificar lead",
          });
          processed.push({ leadId, stage: "contacted_followup" });
        }
        continue;
      }

      if (status === "qualified") {
        const paymentLink = selectPaymentLinkFromLead(lead);
        const alreadyPushed = hasRecentEvent(
          history,
          ["ai_reply_with_payment", "ai_payment_push", "funnel_qualified_push"],
          24
        );

        if (!alreadyPushed) {
          const message = getQualifiedPushMessage(lead, paymentLink);
          await sendWhatsAppMessage(phone, message);
          await createLeadEventDirect({ lead_id: leadId, phone, type: "funnel_qualified_push", message });
          await updateLeadDirect(leadId, {
            next_action: paymentLink ? "whatsapp" : "call",
            next_action_priority: "alta",
            ultima_accion: "Empuje automático de cierre en etapa qualified",
            proxima_accion: paymentLink
              ? "Esperar pago o recuperación automática"
              : "Empujar booking o llamada",
          });
          processed.push({ leadId, stage: "qualified_push" });
        }
      }
    } catch (err) {
      console.error(err);
      failed.push({ leadId: lead?.id || null });
    }
  }

  return { success: true, processed: processed.length, failed: failed.length, data: processed };
}

export async function runVoiceCallsAutomation() {
  const leads = await getAllLeadsForAutomation();
  const processed = [];
  const failed = [];

  for (const lead of leads) {
    try {
      const leadId = lead?.id;
      const phone = normalizePhone(lead?.telefono || "");
      const status = String(lead?.status || "").toLowerCase();
      const score = Number(lead?.score || 0);
      const probability = Number(lead?.predicted_close_probability || 0);

      if (!leadId || !phone) continue;
      if (status !== "qualified") continue;
      if (score < 80 && probability < 75) continue;

      const lastCall = await prisma.voiceCall.findFirst({
        where: { OR: [{ lead_id: leadId }, { phone }] },
        orderBy: { created_at: "desc" },
      });

      if (lastCall && hoursSince(lastCall.created_at) < 24) continue;

      const voiceCall = await prisma.voiceCall.create({
        data: { lead_id: leadId, phone, status: "queued" },
      });

      await createLeadEventDirect({
        lead_id: leadId,
        phone,
        type: "voice_call_started",
        message: JSON.stringify({ voice_call_id: voiceCall.id, status: "queued" }),
      });

      const result = await runExternalVoiceCall(lead);
      const finalStatus = result?.status || (result?.success ? "completed" : "failed");
      const finalResult = result?.result || (result?.success ? "contacted" : "failed");
      const summary =
        result?.summary || "Llamada IA ejecutada sin resumen detallado del proveedor.";
      const transcript = result?.transcript || "";
      const durationSeconds = Number(result?.duration_seconds || 0);

      await prisma.voiceCall.update({
        where: { id: voiceCall.id },
        data: {
          status: finalStatus,
          result: finalResult,
          summary,
          transcript,
          duration_seconds: durationSeconds,
        },
      });

      await createLeadEventDirect({
        lead_id: leadId,
        phone,
        type: "voice_call_completed",
        message: JSON.stringify({
          voice_call_id: voiceCall.id,
          status: finalStatus,
          result: finalResult,
          summary,
          duration_seconds: durationSeconds,
        }),
      });

      await updateLeadDirect(leadId, {
        ultima_accion: "Llamada IA ejecutada automáticamente",
        proxima_accion:
          finalResult === "interested"
            ? "Empujar cierre por WhatsApp o pago"
            : "Revisar respuesta de llamada IA",
        next_action: finalResult === "interested" ? "whatsapp" : "call",
        next_action_priority: finalResult === "interested" ? "alta" : "media",
      });

      await updateLeadMemoryDirect(leadId, {
        temperature: finalResult === "interested" ? "caliente" : "templado",
        last_summary: summary,
      });

      processed.push({ leadId, phone, result: finalResult });
    } catch (err) {
      console.error(err);
      failed.push({ leadId: lead?.id || null });
    }
  }

  return { success: true, processed: processed.length, failed: failed.length, data: processed };
}
