import { NextResponse } from "next/server";
import OpenAI from "openai";
import twilio from "twilio";
import { getInternalApiHeaders } from "@/lib/server/internal-api";

let openai = null;

function getOpenAI() {
  if (openai) return openai;

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "sk-openai-placeholder",
  });

  return openai;
}

function hasPaymentAlreadyBeenSent(history) {
  return (history || []).some((event) => {
    const type = String(event?.type || "").toLowerCase();
    return type === "ai_payment_push" || type === "ai_reply_with_payment";
  });
}

function shouldSendRecoveryFollowup(history, analysis) {
  const paymentSent = hasPaymentAlreadyBeenSent(history);

  if (!paymentSent) return false;

  const intent = String(analysis?.intent || "otro").toLowerCase();
  const objection = String(analysis?.objection || "ninguna").toLowerCase();
  const temperature = String(analysis?.temperature || "templado").toLowerCase();
  const prob = Number(analysis?.close_probability || 0);

  if (["desinteres", "soporte"].includes(intent)) return false;

  if (["precio", "agenda", "comprar"].includes(intent)) return true;
  if (["precio", "pensarlo", "tiempo", "confianza"].includes(objection)) return true;
  if (temperature === "caliente" || prob >= 70) return true;

  return false;
}

function buildRecoveryMessage(analysis, paymentLink, bookingUrl) {
  const objection = String(analysis?.objection || "ninguna").toLowerCase();

  if (objection === "precio") {
    return `Te entiendo. Muchas veces la decisión no es solo por precio, sino por avanzar sin seguir perdiendo tiempo. Si te encaja, te dejo el enlace para hacerlo fácil:\n${paymentLink}`;
  }

  if (objection === "pensarlo") {
    return `Totalmente lógico pensarlo. Para que no se te quede en el aire, te dejo aquí el enlace directo por si quieres avanzar cuando te cuadre:\n${paymentLink}`;
  }

  if (objection === "tiempo") {
    return `Para ponértelo fácil, puedes dejarlo resuelto en un minuto desde aquí:\n${paymentLink}\n\nY si prefieres verlo antes, te dejo también la agenda:\n${bookingUrl}`;
  }

  if (objection === "confianza") {
    return `Es normal querer tenerlo claro antes de avanzar. Si prefieres, lo vemos contigo aquí:\n${bookingUrl}\n\nY si ya lo tienes claro, puedes hacerlo directamente aquí:\n${paymentLink}`;
  }

  return `Si quieres retomar esto y dejarlo cerrado, te lo pongo fácil:\n${paymentLink}\n\nY si prefieres verlo antes contigo, aquí tienes la agenda:\n${bookingUrl}`;
}

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const BOOKING_URL = process.env.BOOKING_URL || "https://cal.com/TU_LINK";
const PAYMENT_URL = process.env.PAYMENT_URL || "";

function normalizePhone(phone = "") {
  return String(phone).replace(/^whatsapp:/, "").trim();
}

function buildTwilioValidationUrl(req) {
  return new URL(req.url).toString();
}

function formDataToObject(formData) {
  const params = {};

  formData.forEach((value, key) => {
    if (!(key in params)) {
      params[key] = String(value);
    }
  });

  return params;
}

function isValidTwilioWebhook(req, params) {
  const authToken =
    process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN || "";
  const signature = req.headers.get("x-twilio-signature") || "";

  if (!authToken || !signature) {
    return false;
  }

  return twilio.validateRequest(
    authToken,
    signature,
    buildTwilioValidationUrl(req),
    params
  );
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function getLeadHistory(phone) {
  try {
    const res = await fetch(
      `${BASE_URL}/api/lead-events?phone=${encodeURIComponent(phone)}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return [];
  }
}

async function saveLeadEvent({ phone, type, message, meta = null }) {
  try {
    await fetch(`${BASE_URL}/api/lead-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        type,
        message: meta ? JSON.stringify({ message, meta }) : message,
      }),
    });
  } catch (err) {
    console.error("Error guardando evento:", err);
  }
}

async function findLeadByPhone(phone) {
  try {
    const res = await fetch(`${BASE_URL}/api/portal/overview`, {
      cache: "no-store",
    });
    const json = await res.json();
    const leads = Array.isArray(json?.leads) ? json.leads : [];
    return (
      leads.find((l) => String(l.telefono || "").replace(/[^\d+]/g, "") === String(phone).replace(/[^\d+]/g, "")) ||
      null
    );
  } catch {
    return null;
  }
}

async function patchLead(leadId, changes) {
  try {
    const res = await fetch(`${BASE_URL}/api/leads/update`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadId,
        ...changes,
      }),
    });
    return await res.json();
  } catch (err) {
    console.error("Error actualizando lead:", err);
    return { success: false };
  }
}

async function classifyConversation({ message, historyText, lead }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      intent: "otro",
      objection: "ninguna",
      temperature: "templado",
      recommended_status: "contacted",
      next_action: "whatsapp",
      close_probability: Number(
        lead?.predicted_close_probability || lead?.score || 50
      ),
      should_push_booking: true,
      should_push_payment: false,
      reason: "Clasificacion por reglas sin OPENAI_API_KEY",
    };
  }

  const prompt = `
Analiza este mensaje de WhatsApp de un lead y devuelve SOLO JSON válido.

Objetivo:
- Detectar intención de compra
- Detectar objeción principal
- Estimar temperatura del lead
- Decidir siguiente acción comercial

Responde con este formato exacto:
{
  "intent": "comprar|info|precio|agenda|objecion|desinteres|soporte|otro",
  "objection": "precio|tiempo|confianza|pensarlo|ninguna|otro",
  "temperature": "caliente|templado|frio",
  "recommended_status": "new|contacted|qualified|won|lost",
  "next_action": "call|whatsapp|sms|wait",
  "close_probability": 0,
  "should_push_booking": true,
  "should_push_payment": false,
  "reason": "texto corto"
}

Contexto del lead:
${JSON.stringify(
  {
    nombre: lead?.nombre || "",
    status: lead?.status || "new",
    necesidad: lead?.necesidad || "",
    score: lead?.score || 0,
    predicted_close_probability: lead?.predicted_close_probability || 0,
    valor_estimado: lead?.valor_estimado || "",
  },
  null,
  2
)}

Historial:
${historyText || "Sin historial"}

Mensaje actual:
${message}
`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres un analista comercial experto en ventas por WhatsApp. Devuelves solo JSON válido.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return safeJsonParse(completion.choices?.[0]?.message?.content || "{}", {
    intent: "otro",
    objection: "ninguna",
    temperature: "templado",
    recommended_status: "contacted",
    next_action: "whatsapp",
    close_probability: 50,
    should_push_booking: false,
    should_push_payment: false,
    reason: "Clasificación por defecto",
  });
}

function getObjectionStrategy(analysis, paymentLink, bookingUrl) {
  const objection = String(analysis?.objection || "ninguna").toLowerCase();
  const temperature = String(analysis?.temperature || "templado").toLowerCase();
  const prob = Number(analysis?.close_probability || 0);

  const shouldPushPayment =
    Boolean(paymentLink) &&
    (analysis?.should_push_payment === true || temperature === "caliente" || prob >= 80);

  const cta = shouldPushPayment
    ? `Si te encaja, puedes empezar directamente aquí: ${paymentLink}`
    : `Si te parece, lo vemos contigo aquí: ${bookingUrl}`;

  const map = {
    precio: {
      angle:
        "reencuadra el precio contra el beneficio, coste de no hacerlo y rapidez de resultado",
      tone: "seguro, claro, breve",
      structure:
        "1) valida la preocupación, 2) explica valor, 3) reduce fricción, 4) CTA",
      example:
        "Te entiendo. La clave no es solo el precio, sino que te ahorra tiempo y acelera el resultado. Si te encaja, damos el siguiente paso ahora.",
      cta,
    },
    tiempo: {
      angle:
        "reduce la fricción, transmite facilidad, rapidez y poco compromiso inicial",
      tone: "ágil, práctico, nada pesado",
      structure:
        "1) valida, 2) deja claro que es rápido/simple, 3) CTA corto",
      example:
        "Totalmente. Precisamente está pensado para hacerlo fácil y rápido, sin complicarte. Lo más simple es dejarlo cerrado ya o verlo en una llamada corta.",
      cta,
    },
    confianza: {
      angle:
        "aumenta seguridad, claridad y acompañamiento; elimina sensación de riesgo",
      tone: "tranquilo, profesional, humano",
      structure:
        "1) valida, 2) transmite claridad/acompañamiento, 3) CTA sin presión",
      example:
        "Es normal querer tenerlo claro antes de avanzar. Te explico exactamente cómo funciona y qué encaja mejor contigo para que decidas con seguridad.",
      cta,
    },
    pensarlo: {
      angle:
        "evita presión, pero baja la inercia proponiendo un siguiente paso concreto",
      tone: "natural, sin empujar demasiado",
      structure:
        "1) valida, 2) simplifica decisión, 3) CTA concreto",
      example:
        "Claro, tiene sentido pensarlo bien. Para no dejarlo en el aire, lo mejor es darte el siguiente paso más fácil ahora y así lo valoras con todo claro.",
      cta,
    },
    ninguna: {
      angle:
        "si no hay objeción, avanza directo al cierre con naturalidad",
      tone: "directo, cercano",
      structure:
        "1) respuesta clara, 2) CTA",
      example:
        "Perfecto, entonces lo más sencillo es avanzar ya por aquí.",
      cta,
    },
    otro: {
      angle:
        "responde la duda de forma útil y vuelve a llevar a acción",
      tone: "claro y orientado a avance",
      structure:
        "1) responde, 2) CTA",
      example:
        "Buena pregunta. Te aclaro eso y, si te encaja, damos el siguiente paso ahora.",
      cta,
    },
  };

  return map[objection] || map.otro;
}

async function generateSalesReply({ message, historyText, lead, analysis }) {
  function selectPaymentLink() {
    const score = Number(lead?.score || 0);
    const prob = Number(analysis?.close_probability || 0);

    if (prob > 80 || score > 80) {
      return process.env.PAYMENT_PREMIUM || "";
    }

    if (prob > 50 || score > 50) {
      return process.env.PAYMENT_PRO || "";
    }

    return process.env.PAYMENT_BASIC || "";
  }

  const bookingUrl = process.env.BOOKING_URL || BOOKING_URL || "";
  const paymentLink = selectPaymentLink();
  const strategy = getObjectionStrategy(analysis, paymentLink, bookingUrl);

  const prompt = `
Eres un closer por WhatsApp que vende de forma natural y sabe romper objeciones.

OBJETIVO:
- cerrar la venta si el lead está listo
- si no está listo, moverlo a cita
- responder como humano
- sonar seguro, breve y nada robótico

REGLAS:
- máximo 4 líneas
- sonar humano y directo
- no sonar robótico
- responder primero a la objeción
- SI detectas intención de compra → ve directo al cierre
- SI el lead ya está convencido → no expliques, cierra
- SI duda → resuelve y cierra
- usa frases cortas
- evita texto largo

SEÑALES DE CIERRE (MUY IMPORTANTE):
- si el lead dice cosas como:
  "ok", "vale", "me interesa", "cómo pago", "lo quiero"
→ NO expliques nada
→ responde con cierre directo + link

- si pregunta precio → responde y luego cierra
- si duda → responde + CTA

ESTRATEGIA DE OBJECIÓN:
Ángulo: ${strategy.angle}
Tono: ${strategy.tone}
Estructura: ${strategy.structure}
Ejemplo orientativo: ${strategy.example}
CTA final recomendado: ${strategy.cta}

DATOS DEL LEAD:
${JSON.stringify(
  {
    nombre: lead?.nombre || "",
    necesidad: lead?.necesidad || "",
    status: lead?.status || "new",
    score: lead?.score || 0,
    predicted_close_probability: lead?.predicted_close_probability || 0,
  },
  null,
  2
)}

ANÁLISIS COMERCIAL:
${JSON.stringify(analysis, null, 2)}

HISTORIAL:
${historyText || "Sin historial"}

MENSAJE ACTUAL:
${message}

Devuélveme solo la respuesta final que enviarías por WhatsApp.
`;

  const fallbackReply =
    analysis?.should_push_payment && paymentLink
      ? `Te entiendo. Lo importante es que tengas claro el valor y puedas avanzar facil. Si te encaja, puedes empezar directamente aqui: ${paymentLink}`
      : `Te entiendo. Para que lo veas claro y sin perder tiempo, lo mejor es verlo contigo aqui: ${bookingUrl}`;

  if (!process.env.OPENAI_API_KEY) {
    return fallbackReply;
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.75,
    messages: [
      {
        role: "system",
        content:
          "Eres un closer experto en WhatsApp. Tu trabajo es resolver objeciones y convertir leads en citas o pagos.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || fallbackReply;
}

async function sendWhatsapp(to, message) {
  try {
    const res = await fetch(`${BASE_URL}/api/automation/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getInternalApiHeaders(),
      },
      body: JSON.stringify({
        to,
        message,
      }),
    });

    return await res.json();
  } catch (err) {
    console.error("Error enviando WhatsApp:", err);
    return { success: false };
  }
}

function getCrmUpdateFromAnalysis(analysis) {
  const objection = String(analysis?.objection || "ninguna").toLowerCase();
  const intent = String(analysis?.intent || "otro").toLowerCase();
  const temperature = String(analysis?.temperature || "templado").toLowerCase();
  const prob = Number(analysis?.close_probability || 0);

  if (intent === "desinteres") {
    return {
      status: "lost",
      next_action: "wait",
      next_action_priority: "baja",
      proxima_accion: "No insistir. Revisar más adelante si reaparece interés.",
      ultima_accion: "Lead marcado como perdido por desinterés detectado en WhatsApp",
    };
  }

  if (prob >= 80 || temperature === "caliente") {
    return {
      status: "qualified",
      next_action: "whatsapp",
      next_action_priority: "alta",
      proxima_accion: analysis?.should_push_payment
        ? "Enviar link de pago y seguimiento corto de cierre"
        : "Empujar reserva de cita inmediata",
      ultima_accion: "Lead calentado por conversación IA en WhatsApp",
    };
  }

  if (objection === "precio") {
    return {
      status: "contacted",
      next_action: "whatsapp",
      next_action_priority: "alta",
      proxima_accion: "Responder objeción de precio y reenfocar en valor",
      ultima_accion: "Objeción de precio detectada en WhatsApp",
    };
  }

  if (objection === "tiempo") {
    return {
      status: "contacted",
      next_action: "call",
      next_action_priority: "media",
      proxima_accion: "Proponer llamada corta o cierre simplificado",
      ultima_accion: "Objeción de tiempo detectada en WhatsApp",
    };
  }

  if (objection === "confianza") {
    return {
      status: "contacted",
      next_action: "call",
      next_action_priority: "alta",
      proxima_accion: "Refuerzo de confianza con llamada o aclaración personalizada",
      ultima_accion: "Objeción de confianza detectada en WhatsApp",
    };
  }

  if (objection === "pensarlo") {
    return {
      status: "contacted",
      next_action: "whatsapp",
      next_action_priority: "media",
      proxima_accion: "Follow-up corto para evitar que el lead se enfríe",
      ultima_accion: "Lead indica que quiere pensarlo",
    };
  }

  if (intent === "agenda") {
    return {
      status: "qualified",
      next_action: "whatsapp",
      next_action_priority: "alta",
      proxima_accion: "Enviar reserva y confirmar cita",
      ultima_accion: "Lead con intención de agenda detectada en WhatsApp",
    };
  }

  if (intent === "comprar") {
    return {
      status: "qualified",
      next_action: "whatsapp",
      next_action_priority: "alta",
      proxima_accion: "Empujar cierre directo con pago",
      ultima_accion: "Lead con intención de compra detectada en WhatsApp",
    };
  }

  return {
    status: "contacted",
    next_action: "whatsapp",
    next_action_priority: "media",
    proxima_accion: "Continuar conversación y cualificar mejor",
    ultima_accion: "Conversación WhatsApp procesada por IA",
  };
}

function shouldAutoSendPayment(analysis) {
  const intent = String(analysis?.intent || "otro").toLowerCase();
  const temperature = String(analysis?.temperature || "templado").toLowerCase();
  const prob = Number(analysis?.close_probability || 0);

  const buyingIntent = ["comprar", "agenda", "precio"].includes(intent);

  return buyingIntent && (temperature === "caliente" || prob >= 85);
}

function selectPaymentLinkFromAnalysis(lead, analysis) {
  const tier = selectProductTierFromAnalysis(lead, analysis);

  if (tier === "premium") return process.env.PAYMENT_PREMIUM || "";
  if (tier === "pro") return process.env.PAYMENT_PRO || "";
  return process.env.PAYMENT_BASIC || "";
}

function selectProductTierFromAnalysis(lead, analysis) {
  const score = Number(lead?.score || 0);
  const prob = Number(analysis?.close_probability || 0);
  const intent = String(analysis?.intent || "otro").toLowerCase();
  const objection = String(analysis?.objection || "ninguna").toLowerCase();
  const value = Number(lead?.valor_estimado || 0);

  if (
    prob >= 85 ||
    score >= 85 ||
    value >= 1000 ||
    intent === "comprar"
  ) {
    return "premium";
  }

  if (
    prob >= 60 ||
    score >= 60 ||
    intent === "precio" ||
    intent === "agenda" ||
    objection === "confianza"
  ) {
    return "pro";
  }

  return "basic";
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const twilioParams = formDataToObject(formData);

    if (!isValidTwilioWebhook(req, twilioParams)) {
      return NextResponse.json(
        { success: false, message: "Firma de webhook inválida" },
        { status: 403 }
      );
    }

    const inboundMessage = String(formData.get("Body") || "").trim();
    const from = String(formData.get("From") || "");
    const phone = normalizePhone(from);

    if (!phone || !inboundMessage) {
      return NextResponse.json({ success: false, message: "Faltan datos" });
    }

    const lead = await findLeadByPhone(phone);
    const history = await getLeadHistory(phone);

const historyText = history
  .slice(0, 12)
  .reverse()
  .map((e) => {
    let content = e.message;
    try {
      const parsed = JSON.parse(e.message);
      if (parsed?.message) content = parsed.message;
    } catch {}
    return `${e.type}: ${content}`;
  })
  .join("\n");

const paymentAlreadySent = hasPaymentAlreadyBeenSent(history);

    await saveLeadEvent({
      phone,
      type: "incoming_whatsapp",
      message: inboundMessage,
    });

    const analysis = await classifyConversation({
      message: inboundMessage,
      historyText,
      lead,
    });

    const productTier = selectProductTierFromAnalysis(lead, analysis);
const paymentLink = selectPaymentLinkFromAnalysis(lead, analysis);

const reply = await generateSalesReply({
  message: inboundMessage,
  historyText,
  lead,
  analysis,
});

    await saveLeadEvent({
  phone,
  type: "ai_analysis",
  message: analysis.reason || "Análisis IA",
  meta: {
    ...analysis,
    recommended_product_tier: productTier,
  },
});

    const autoSendPayment =
  shouldAutoSendPayment(analysis) &&
  paymentLink &&
  !paymentAlreadySent;

const shouldRecoveryFollowup =
  !autoSendPayment &&
  paymentLink &&
  shouldSendRecoveryFollowup(history, analysis);

let finalReply = reply;
let eventType = "ai_reply";

if (autoSendPayment) {
  finalReply = `${reply}\n\nSi quieres avanzar ya, te dejo aquí el enlace directo:\n${paymentLink}`;
  eventType = "ai_reply_with_payment";
} else if (shouldRecoveryFollowup) {
  finalReply = buildRecoveryMessage(
    analysis,
    paymentLink,
    process.env.BOOKING_URL || BOOKING_URL || ""
  );
  eventType = "ai_payment_recovery";
}

await saveLeadEvent({
  phone,
  type: eventType,
  message: finalReply,
});

await sendWhatsapp(phone, finalReply);

    if (lead?.id) {
  const crmUpdate = getCrmUpdateFromAnalysis(analysis);

  await patchLead(lead.id, {
  status: crmUpdate.status,
  next_action: crmUpdate.next_action,
  next_action_priority: crmUpdate.next_action_priority,
  ultima_accion: crmUpdate.ultima_accion,
  proxima_accion: crmUpdate.proxima_accion,
  notes: [
    lead.notes || "",
    `\n[IA CIERRE] Intent: ${analysis.intent || "-"}`,
    `Objeción: ${analysis.objection || "-"}`,
    `Temperatura: ${analysis.temperature || "-"}`,
    `Prob. cierre: ${analysis.close_probability ?? "-"}`,
    `Producto recomendado: ${productTier}`,
    `Motivo: ${analysis.reason || "-"}`,
  ].join(" ").trim(),
});
}

    return NextResponse.json({
      success: true,
      analysis,
      reply,
    });
  } catch (err) {
    console.error("Webhook WhatsApp error:", err);
    return NextResponse.json({
      success: false,
      message: "Error procesando mensaje",
    });
  }
}
