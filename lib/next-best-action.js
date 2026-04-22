function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function hoursSince(dateValue) {
  if (!dateValue) return 9999;

  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return 9999;

  const now = Date.now();
  return Math.max(0, (now - timestamp) / (1000 * 60 * 60));
}

export function hasPhone(lead) {
  const phone = toText(lead?.telefono);
  return phone.length >= 7;
}

export function hasWhatsappConsent(lead) {
  return lead?.whatsapp_opt_in !== false;
}

export function hasSmsConsent(lead) {
  return lead?.sms_opt_in !== false;
}

export function buildSalesMessage({ action, lead, brandName = "nuestro equipo" }) {
  const nombre = toText(lead?.nombre, "hola");
  const necesidad = toText(lead?.necesidad, "tu solicitud");
  const ciudad = toText(lead?.ciudad);
  const ciudadTexto = ciudad ? ` en ${ciudad}` : "";

  if (action === "call") {
    return `Hola ${nombre}, te llamamos de ${brandName} para avanzar con ${necesidad}${ciudadTexto}.`;
  }

  if (action === "whatsapp") {
    return `Hola ${nombre}, te escribimos de ${brandName} para continuar con ${necesidad}${ciudadTexto}. Si te viene bien, te ayudamos ahora mismo.`;
  }

  if (action === "sms") {
    return `Hola ${nombre}, somos ${brandName}. Queremos continuar con tu solicitud sobre ${necesidad}. Responde a este mensaje y te ayudamos.`;
  }

  return `Seguimos revisando tu caso, ${nombre}.`;
}

export function getPipelinePressure(status) {
  const normalized = toText(status, "new").toLowerCase();

  if (normalized === "qualified") return 30;
  if (normalized === "contacted") return 15;
  if (normalized === "new") return 10;
  if (normalized === "won") return -999;
  if (normalized === "lost") return -999;
  return 0;
}

export function getInterestBoost(interes) {
  const normalized = toText(interes, "medio").toLowerCase();

  if (normalized === "alto") return 25;
  if (normalized === "medio") return 10;
  if (normalized === "bajo") return -10;
  return 0;
}

export function getRecencyPenalty(hours) {
  if (hours < 1) return -25;
  if (hours < 6) return -15;
  if (hours < 12) return -8;
  if (hours < 24) return 0;
  if (hours < 48) return 10;
  if (hours < 72) return 18;
  return 25;
}

export function getResponseSignals(lead) {
  let score = 0;

  if (lead?.followup_sms_sent) score -= 5;
  if (lead?.owner) score += 4;
  if (lead?.next_step_ai) score += 5;
  if (lead?.ultima_accion && String(lead.ultima_accion).toLowerCase().includes("contact")) score += 3;
  if (lead?.valor_estimado && Number(lead.valor_estimado) >= 500) score += 10;
  if (lead?.valor_estimado && Number(lead.valor_estimado) >= 1500) score += 15;

  return score;
}

export function calculateActionScore(lead) {
  const score = toNumber(lead?.score, 0);
  const prob = toNumber(lead?.predicted_close_probability, 0);
  const hours = hoursSince(lead?.last_contact_at || lead?.updated_at || lead?.created_at);

  const actionScore =
    score +
    prob * 0.6 +
    getPipelinePressure(lead?.status) +
    getInterestBoost(lead?.interes) +
    getRecencyPenalty(hours) +
    getResponseSignals(lead);

  return Math.round(actionScore);
}

export function decideActionType(lead) {
  const status = toText(lead?.status, "new").toLowerCase();
  const interest = toText(lead?.interes, "medio").toLowerCase();
  const score = toNumber(lead?.score, 0);
  const prob = toNumber(lead?.predicted_close_probability, 0);
  const hours = hoursSince(lead?.last_contact_at || lead?.updated_at || lead?.created_at);
  const canCall = hasPhone(lead);
  const canWhatsapp = hasPhone(lead) && hasWhatsappConsent(lead);
  const canSms = hasPhone(lead) && hasSmsConsent(lead);

  if (status === "won" || status === "lost") {
    return {
      action: "wait",
      priority: "none",
      reason: "El lead ya está cerrado o descartado.",
    };
  }

  if (status === "qualified" && canCall && (score >= 75 || prob >= 70) && hours >= 12) {
    return {
      action: "call",
      priority: "high",
      reason: "Lead cualificado y caliente. Conviene llamada directa de cierre.",
    };
  }

  if (status === "new" && canCall && score >= 85 && interest === "alto" && hours >= 1) {
    return {
      action: "call",
      priority: "high",
      reason: "Lead nuevo, muy caliente y con alta intención. Mejor llamada inmediata.",
    };
  }

  if (status === "contacted" && canWhatsapp && interest === "alto" && hours >= 24) {
    return {
      action: "whatsapp",
      priority: "high",
      reason: "Lead con interés alto sin seguimiento reciente. WhatsApp es la vía más rápida.",
    };
  }

  if (status === "new" && canWhatsapp && score >= 55 && hours >= 2) {
    return {
      action: "whatsapp",
      priority: "medium",
      reason: "Lead prometedor. WhatsApp permite activar conversación con baja fricción.",
    };
  }

  if ((status === "new" || status === "contacted") && canSms && hours >= 48) {
    return {
      action: "sms",
      priority: "medium",
      reason: "Hace tiempo que no hay contacto. Un SMS puede reactivar el interés.",
    };
  }

  if (hours < 6) {
    return {
      action: "wait",
      priority: "low",
      reason: "El lead es reciente. Conviene no insistir todavía.",
    };
  }

  if (canWhatsapp) {
    return {
      action: "whatsapp",
      priority: "low",
      reason: "Conviene mantener el seguimiento sin ser invasivo.",
    };
  }

  if (canSms) {
    return {
      action: "sms",
      priority: "low",
      reason: "SMS como recordatorio ligero de seguimiento.",
    };
  }

  return {
    action: "wait",
    priority: "low",
    reason: "No hay suficiente contexto o canal disponible para actuar ahora.",
  };
}

export function getRecommendedExecutionMode({ action, priority, autoMode }) {
  if (!autoMode) return "manual";

  if (priority === "high" && (action === "sms" || action === "whatsapp")) {
    return "automatic";
  }

  if (priority === "high" && action === "call") {
    return "manual";
  }

  if (priority === "medium" && action === "sms") {
    return "automatic";
  }

  return "manual";
}

export function getNextBestActionRules(lead, brandName = "nuestro equipo") {
  const baseDecision = decideActionType(lead);
  const actionScore = calculateActionScore(lead);

  const message = buildSalesMessage({
    action: baseDecision.action,
    lead,
    brandName,
  });

  const executionMode = getRecommendedExecutionMode({
    action: baseDecision.action,
    priority: baseDecision.priority,
    autoMode: !!lead?.auto_mode,
  });

  return {
    action: baseDecision.action,
    reason: baseDecision.reason,
    message,
    priority: baseDecision.priority,
    action_score: actionScore,
    execution_mode: executionMode,
    calculated_at: new Date().toISOString(),
    source: "rules",
  };
}