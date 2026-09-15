import { reservarGeneracionIA } from "@/lib/server/ai-budget";
import { conRegistroIA } from "@/lib/server/ia";
import { guardarEvento } from "@/lib/server/bandeja-webhooks";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabase } from "@/lib/supabase";
import {
  sendWhatsAppMessage as sendDirectWhatsAppMessage,
  updateLeadDirect,
} from "@/lib/server/automation-service";
import {
  leerWebhookDeMensajeria,
  verificarWebhookTwilio,
} from "@/lib/server/twilio";
import { toE164 } from "@/lib/server/phone";
import { observeRoute } from "@/lib/server/observability.mjs";
import { MensajeTwilio, validar } from "@/lib/server/esquemas";

let openai = null;
const supabase = getSupabase();

function getOpenAI() {
  if (openai) return openai;

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20000,
    maxRetries: 0,
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

// Reexportado desde lib/server/phone.js: empareja el mensaje entrante con
// el cliente por su número, y necesita la misma forma canónica que el
// enrutado de voz.
const normalizePhone = toE164;

/**
 * ¿Viene este webhook de Twilio de verdad?
 *
 * Twilio firma con HMAC-SHA1 sobre la URL completa más los campos del cuerpo
 * ordenados. Para que la firma cuadre, la URL tiene que ser EXACTAMENTE la que
 * Twilio tiene configurada, incluidos el esquema y el dominio: detrás de un
 * proxy, `req.url` puede decir http donde el mundo ve https, y entonces no
 * cuadra nunca. Por eso se reconstruye desde las cabeceras de reenvío.
 */
function esWebhookDeTwilio(req, campos = {}) {
  const firma = req.headers.get("x-twilio-signature") || "";
  if (!firma) return false;

  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || url.host;
  const esquema = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const urlPublica = `${esquema}://${host}${url.pathname}${url.search}`;

  return verificarWebhookTwilio({ url: urlPublica, params: campos, signature: firma });
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function resolveClientContext(to = "") {
  const normalizedTo = normalizePhone(to);
  const { data, error } = await supabase
    .from("clients")
    .select("id,name,brand_name,twilio_number")
    .limit(200);

  if (error) {
    throw new Error(error.message || "No se pudieron cargar clientes");
  }

  const clients = data || [];
  const exactMatch = clients.find(
    (client) => normalizePhone(client.twilio_number || "") === normalizedTo
  );

  if (exactMatch) {
    return exactMatch;
  }

  if (clients.length === 1) {
    return clients[0];
  }

  return null;
}

async function getLeadHistoryForClient(phone, clientId) {
  try {
    const { data, error } = await supabase
      .from("lead_events")
      .select("*")
      .eq("phone", phone)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      throw new Error(error.message || "No se pudo cargar el historial");
    }

    return data || [];
  } catch {
    return [];
  }
}

async function saveLeadEventForClient({
  phone,
  leadId = null,
  clientId = "",
  type,
  message,
  meta = null,
}) {
  try {
    await supabase.from("lead_events").insert({
      client_id: clientId,
      lead_id: leadId,
      phone,
      type,
      message: meta ? JSON.stringify({ message, meta }) : message,
    });
  } catch (err) {
    console.error("Error guardando evento:", err);
  }
}

async function findLeadByPhone(phone, clientId) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message || "No se pudieron cargar leads");
  }

  const normalizedPhone = normalizePhone(phone);
  return (
    (data || []).find(
      (lead) => normalizePhone(lead.telefono || "") === normalizedPhone
    ) || null
  );
}

async function patchLead(leadId, changes) {
  try {
    await updateLeadDirect(leadId, changes);
    return { success: true };
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

  await reservarGeneracionIA(lead?.client_id);
  const completion = await conRegistroIA({ clientId: lead?.client_id, uso: "whatsapp-clasificar", modelo: "gpt-4o-mini", promptVersion: "wa-clasificar-v1" }, () =>
      getOpenAI().chat.completions.create({
    max_tokens: 1000,
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
        content: prompt.slice(0, 16000),
      },
    ],
  })
    );

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

  await reservarGeneracionIA(lead?.client_id);
  const completion = await conRegistroIA({ clientId: lead?.client_id, uso: "whatsapp-responder", modelo: "gpt-4o-mini", promptVersion: "wa-responder-v1" }, () =>
      getOpenAI().chat.completions.create({
    max_tokens: 1000,
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
        content: prompt.slice(0, 16000),
      },
    ],
  })
    );

  return completion.choices?.[0]?.message?.content?.trim() || fallbackReply;
}

async function sendWhatsapp(to, message) {
  try {
    await sendDirectWhatsAppMessage(normalizePhone(to), message);
    return { success: true };
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

/* La respuesta de la función de proceso: el mismo objeto que antes salía
   por HTTP, para que quien lo lea desde la cola vea lo mismo. */
const respuesta = (cuerpo, init) => ({ ...cuerpo, status: init?.status || 200 });

/**
 * Procesa un mensaje entrante de WhatsApp ya verificado.
 *
 * Es el cuerpo del webhook de siempre, sacado a una función para que lo
 * ejecute la cola de trabajos y no la petición de Twilio. Recibe los campos
 * del formulario tal cual llegaron y devuelve lo que antes era la respuesta
 * HTTP. Todo lo que hace de cara al cliente —contestar por WhatsApp, apuntar
 * el evento— lo hace por API, así que procesarlo en diferido no cambia lo que
 * ve nadie, sólo cuándo.
 *
 * Antes de nada se reclama el MessageSid: si este mismo mensaje ya se
 * procesó —un reintento de Twilio, un reproceso desde administración— no se
 * contesta dos veces.
 */
export async function procesarMensajeEntrante(campos) {
  const messageSid = String(campos.MessageSid || campos.SmsSid || "").trim();
  if (messageSid) {
    const { data: primeraVez, error } = await supabase.rpc("reclamar_webhook", {
      p_proveedor: "twilio-whatsapp",
      p_evento_id: messageSid,
    });
    if (error) throw new Error(error.message || "No se pudo reclamar el mensaje");
    if (primeraVez === false) return respuesta({ success: true, duplicated: true });
  }

    const parsed = leerWebhookDeMensajeria(campos);

    /* Sin texto es un aviso de estado, no un mensaje de nadie. Se contesta
       bien para que Twilio no lo reintente. */
    if (!String(parsed.text || "").trim()) {
      return respuesta({ success: true, ignored: true });
    }

    const inboundMessage = String(parsed.text || "").trim();
    const from = String(parsed.from || "");
    const to = String(parsed.to || "");
    const phone = normalizePhone(from);

    if (!phone || !inboundMessage) {
      return respuesta({ success: false, message: "Faltan datos" });
    }

    const clientContext = await resolveClientContext(to);
    if (!clientContext?.id) {
      return respuesta(
        { success: false, message: "No se pudo resolver el cliente del webhook" },
        { status: 400 }
      );
    }

    const lead = await findLeadByPhone(phone, clientContext.id);
    const history = await getLeadHistoryForClient(phone, clientContext.id);

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

    await saveLeadEventForClient({
      clientId: clientContext.id,
      leadId: lead?.id || null,
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

    await saveLeadEventForClient({
  clientId: clientContext.id,
  leadId: lead?.id || null,
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

await saveLeadEventForClient({
  clientId: clientContext.id,
  leadId: lead?.id || null,
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

    return respuesta({
      success: true,
      analysis,
      reply,
      clientId: clientContext.id,
    });
}

async function manejarPOST(req) {
  try {
    /* Twilio manda un formulario, no JSON, y el mensaje ES el webhook: no hay
       un `event_type` que mirar como en Telnyx. Lo que sí hay son avisos de
       estado de mensajes que hemos enviado nosotros, y esos llegan por la
       misma puerta con `Body` vacío. */
    const rawPayload = await req.text();
    const campos = Object.fromEntries(new URLSearchParams(rawPayload));
    /* Se comprueba la forma, pero se sigue con los campos tal cual llegaron:
       la firma de Twilio se calcula sobre ellos sin tocar. */
    const leido = validar(MensajeTwilio, campos, { mensaje: "Mensaje no válido" });
    if (leido.respuesta) return leido.respuesta;

    if (!esWebhookDeTwilio(req, campos)) {
      return NextResponse.json(
        { success: false, message: "Firma de webhook inválida" },
        { status: 403 }
      );
    }

    /* Sin texto es un aviso de estado, no un mensaje de nadie. Se contesta
       bien para que Twilio no lo reintente, y no se guarda: no hay nada que
       procesar. */
    if (!String(leerWebhookDeMensajeria(campos).text || "").trim()) {
      return NextResponse.json({ success: true, ignored: true });
    }

    /* Aquí acaba lo que hace la petición. Lo demás —buscar el contacto, leer
       el historial, preguntar a OpenAI, contestar— lo hace la cola. Twilio
       recibe su 2xx en milisegundos, y un proveedor lento en medio ya no es
       un timeout que se convierte en reintento. */
    const guardado = await guardarEvento({
      proveedor: "twilio-whatsapp",
      tipo: "mensaje",
      eventoId: String(campos.MessageSid || campos.SmsSid || "") || null,
      payload: campos,
    });

    return NextResponse.json({ success: true, encolado: guardado.encolado, evento: guardado.id });
  } catch (err) {
    console.error("Webhook WhatsApp error:", err);
    return NextResponse.json({
      success: false,
      message: "Error procesando mensaje",
    });
  }
}

export const POST = observeRoute("api.whatsapp.webhook.post", manejarPOST);
