function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatText(value = "") {
  return String(value || "").trim();
}

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatEventPreview(event = {}) {
  const raw = event?.description || event?.body || event?.message || "";
  const parsed = typeof raw === "string" ? safeParseJson(raw) : raw;

  if (parsed && typeof parsed === "object") {
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }

    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
  }

  return formatText(raw) || "Actividad registrada";
}

function getEventChannel(type = "") {
  const normalized = String(type || "").toLowerCase();

  if (
    normalized.includes("whatsapp") ||
    normalized.startsWith("ai_reply") ||
    normalized.includes("payment_followup") ||
    normalized.includes("lead_reactivation") ||
    normalized.includes("onboarding")
  ) {
    return "whatsapp";
  }

  if (
    normalized.includes("voice") ||
    normalized.includes("call")
  ) {
    return "voice";
  }

  if (normalized.includes("payment")) {
    return "billing";
  }

  return "system";
}

function getEventDirection(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "incoming_whatsapp") return "in";
  if (
    normalized.startsWith("ai_reply") ||
    normalized.includes("followup") ||
    normalized.includes("onboarding") ||
    normalized.includes("payment") ||
    normalized.includes("voice_call")
  ) {
    return "out";
  }
  return "system";
}

export function getDefaultPlaybookWorkspace({
  industry = "",
  brandName = "Nesped",
} = {}) {
  const normalizedIndustry = formatText(industry).toLowerCase();
  const industryHint =
    normalizedIndustry === "clinica dental"
      ? "prioriza confianza clínica, rapidez de respuesta y claridad en el tratamiento"
      : normalizedIndustry === "inmobiliaria"
        ? "prioriza urgencia comercial, agilidad de visita y claridad en condiciones"
        : normalizedIndustry
          ? `adapta el lenguaje al sector ${normalizedIndustry}`
          : "adapta el lenguaje al sector del cliente";

  return {
    tone: "humano, consultivo, seguro y premium",
    opening:
      `Abre con claridad, energía serena y una referencia directa a ${brandName}.`,
    qualification:
      "Detecta necesidad, urgencia, presupuesto, timing y siguiente paso sin sonar a interrogatorio.",
    objections:
      "Escucha, valida la objeción, responde breve y vuelve a proponer un siguiente paso concreto.",
    closing:
      "Cierra con una acción pequeña y clara: llamada, cita, demo, pago o WhatsApp de seguimiento.",
    followup:
      "Haz follow-up corto, útil y con contexto. Evita mensajes largos o robóticos.",
    upsell:
      "Propón upgrade solo cuando el cliente ya vea valor y el siguiente nivel resuelva una necesidad clara.",
    handoff:
      "Si detectas alta intención, deja el lead listo para el equipo humano con resumen accionable.",
    notes:
      `Mantén la conversación muy natural y ${industryHint}.`,
  };
}

export function getPlaybookLibrary({ industry = "", brandName = "Nesped" } = {}) {
  const workspace = getDefaultPlaybookWorkspace({ industry, brandName });

  return [
    {
      id: "voice-opening",
      title: "Apertura de llamada",
      channel: "voz",
      stage: "apertura",
      description: "Cómo abrir con seguridad y sonar humano desde el primer segundo.",
      content: `${workspace.opening} Presenta valor en menos de 10 segundos.`,
    },
    {
      id: "qualification",
      title: "Cualificación premium",
      channel: "voz",
      stage: "cualificacion",
      description: "Preguntas para entender interés real sin parecer un formulario.",
      content: workspace.qualification,
    },
    {
      id: "objections",
      title: "Gestión de objeciones",
      channel: "voz",
      stage: "objeciones",
      description: "Respuesta corta, natural y útil cuando hay dudas o fricción.",
      content: workspace.objections,
    },
    {
      id: "followup-whatsapp",
      title: "Follow-up WhatsApp",
      channel: "whatsapp",
      stage: "seguimiento",
      description: "Mensajería breve con continuidad real y sin tono robótico.",
      content: workspace.followup,
    },
    {
      id: "closing",
      title: "Cierre y siguiente paso",
      channel: "voz",
      stage: "cierre",
      description: "Convertir interés en acción concreta sin presión rara.",
      content: workspace.closing,
    },
    {
      id: "upsell",
      title: "Upgrade inteligente",
      channel: "email",
      stage: "upsell",
      description: "Cómo abrir una ampliación de plan solo cuando tiene sentido.",
      content: workspace.upsell,
    },
  ];
}

export function serializePlaybookWorkspace(workspace = {}) {
  const normalized = {
    tone: formatText(workspace.tone),
    opening: formatText(workspace.opening),
    qualification: formatText(workspace.qualification),
    objections: formatText(workspace.objections),
    closing: formatText(workspace.closing),
    followup: formatText(workspace.followup),
    upsell: formatText(workspace.upsell),
    handoff: formatText(workspace.handoff),
    notes: formatText(workspace.notes),
  };

  const json = JSON.stringify(normalized);

  return [
    "CONFIGURACION_PLAYBOOK_NESPED",
    json,
    "FIN_CONFIGURACION_PLAYBOOK_NESPED",
    "",
    `Tono: ${normalized.tone}.`,
    `Apertura: ${normalized.opening}.`,
    `Cualificación: ${normalized.qualification}.`,
    `Objeciones: ${normalized.objections}.`,
    `Cierre: ${normalized.closing}.`,
    `Follow-up: ${normalized.followup}.`,
    `Upsell: ${normalized.upsell}.`,
    `Handoff: ${normalized.handoff}.`,
    normalized.notes ? `Notas extra: ${normalized.notes}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parsePlaybookWorkspace(prompt = "", defaults = {}) {
  const baseCompiledPrompt = formatText(prompt) || serializePlaybookWorkspace(defaults);
  const fallback = {
    ...defaults,
    compiledPrompt: baseCompiledPrompt,
  };

  const match = String(prompt || "").match(
    /CONFIGURACION_PLAYBOOK_NESPED\s*([\s\S]*?)\s*FIN_CONFIGURACION_PLAYBOOK_NESPED/
  );

  if (!match?.[1]) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(match[1]);
    return {
      ...fallback,
      ...parsed,
      compiledPrompt: formatText(prompt),
    };
  } catch {
    return fallback;
  }
}

export function buildOnboardingChecklist({
  data,
  billingData,
  healthData,
} = {}) {
  const client = data?.client || {};
  const settings = data?.settings || {};
  const users = data?.users || [];
  const leads = data?.leads || [];

  const items = [
    {
      id: "branding",
      title: "Identidad y branding",
      done: Boolean(client.brand_name && client.primary_color && client.secondary_color),
      detail: "Define nombre de marca, colores y logo para que el portal se sienta propio.",
      view: "settings",
    },
    {
      id: "billing",
      title: "Facturación activa",
      done: Boolean(
        billingData?.activeSubscription ||
          client.stripe_customer_id ||
          billingData?.paidInvoicesCount
      ),
      detail: "Confirma el plan, el customer de Stripe y el flujo de cobro.",
      view: "billing",
    },
    {
      id: "team",
      title: "Equipo con acceso",
      done: users.length >= 2,
      detail: "Invita al menos a una persona más del equipo con permisos adecuados.",
      view: "team",
    },
    {
      id: "playbook",
      title: "IA entrenada",
      done: Boolean(client.prompt),
      detail: "Define tono, objeciones y cierre para que la IA hable como la marca.",
      view: "playbooks",
    },
    {
      id: "channels",
      title: "Canales conectados",
      done: Boolean(healthData?.services?.telephony?.ready && healthData?.services?.ai?.ready),
      detail: "Comprueba voz, IA y los canales de salida principales.",
      view: "operations",
    },
    {
      id: "reports",
      title: "Reporting activo",
      done: Boolean(settings.daily_report_email || settings.weekly_report_email),
      detail: "Activa emails de seguimiento para owner o equipo.",
      view: "settings",
    },
    {
      id: "pipeline",
      title: "Primer pipeline cargado",
      done: leads.length > 0,
      detail: "Sube o genera leads para activar CRM, scoring y automatizaciones.",
      view: "pipeline",
    },
  ];

  const completed = items.filter((item) => item.done).length;

  return {
    items,
    completed,
    total: items.length,
    progress: items.length ? Math.round((completed / items.length) * 100) : 0,
    nextStep: items.find((item) => !item.done) || null,
  };
}

export function computeUsagePressure({ data, billingData } = {}) {
  const client = data?.client || {};
  const metrics = data?.metrics || {};
  const callsLimit = toNumber(client.calls_limit || client.callsLimit, 0);
  const totalCalls = toNumber(metrics.totalCalls, 0);
  const ratio = callsLimit > 0 ? totalCalls / callsLimit : 0;

  let level = "healthy";
  if (ratio >= 1) level = "critical";
  else if (ratio >= 0.85) level = "high";
  else if (ratio >= 0.65) level = "medium";

  const recommendation =
    billingData?.activeSubscription && level !== "healthy"
      ? "Tu uso ya está muy cerca del límite. Conviene ampliar plan antes de frenar operaciones."
      : !billingData?.activeSubscription && totalCalls > 0
        ? "Ya hay uso real. Activar un plan gestionado te dará continuidad y mejor control."
        : "El uso actual está dentro del rango esperado.";

  return {
    level,
    totalCalls,
    callsLimit,
    ratio,
    usagePercent: Math.round(ratio * 100),
    recommendation,
  };
}

export function scoreVoiceCallQA(call = {}) {
  const transcript = String(call.transcript || "").toLowerCase();
  const summary = String(call.summary || call.summary_long || "").trim();
  const result = String(call.result || call.status || "").toLowerCase();
  const duration = toNumber(call.duration_seconds, 0);

  let quality = 52;
  let empathy = 48;
  let closing = 44;
  const issues = [];
  const strengths = [];

  if (summary) {
    quality += 12;
    strengths.push("Resumen disponible");
  } else {
    issues.push("Sin resumen claro de llamada");
  }

  if (duration >= 45) {
    quality += 8;
  } else {
    issues.push("Llamada demasiado corta");
  }

  if (transcript.length > 180) {
    quality += 10;
  } else {
    issues.push("Transcripción muy pobre o incompleta");
  }

  if (/(entiendo|perfecto|claro|gracias|sin problema|te explico|te ayudo)/.test(transcript)) {
    empathy += 18;
    strengths.push("Buen tono empático");
  } else {
    issues.push("Falta de señales claras de empatía");
  }

  if (/(agendar|agenda|cita|demo|enviar|pago|link|whatsapp|mañana|siguiente paso)/.test(transcript)) {
    closing += 20;
    strengths.push("Propone siguiente paso");
  } else {
    issues.push("No se percibe cierre accionable");
  }

  if (["booked", "converted", "qualified", "interested", "completed"].includes(result)) {
    quality += 14;
    closing += 16;
    strengths.push("Resultado comercial positivo");
  } else if (["failed", "no_answer", "busy"].includes(result)) {
    quality -= 8;
    closing -= 6;
  }

  quality = Math.max(0, Math.min(100, Math.round(quality)));
  empathy = Math.max(0, Math.min(100, Math.round(empathy)));
  closing = Math.max(0, Math.min(100, Math.round(closing)));

  const overall = Math.round((quality + empathy + closing) / 3);
  const priority = overall < 55 ? "high" : overall < 72 ? "medium" : "low";

  return {
    overall,
    quality,
    empathy,
    closing,
    priority,
    strengths,
    issues,
    recommendation:
      issues[0] || "La llamada está bien encaminada. Mantén el tono y aprieta más el cierre.",
  };
}

export function buildLeadTimeline({
  call,
  events = [],
  notes = [],
  comments = [],
  reminders = [],
} = {}) {
  const timeline = [];

  if (call?.created_at) {
    timeline.push({
      id: `call:${call.id || call.created_at}`,
      type: "call",
      title: "Llamada IA",
      body: call.summary || call.summary_long || call.result || "Actividad de llamada registrada.",
      created_at: call.created_at,
      accent: "blue",
    });
  }

  events.forEach((item) => {
    timeline.push({
      id: `event:${item.id}`,
      type: "event",
      title: item.title || item.type || "Evento",
      body: item.description || item.message || "Actividad del sistema",
      created_at: item.created_at,
      accent: "purple",
    });
  });

  notes.forEach((item) => {
    timeline.push({
      id: `note:${item.id}`,
      type: "note",
      title: `Nota de ${item.author || "equipo"}`,
      body: item.body || "",
      created_at: item.created_at,
      accent: "green",
    });
  });

  comments.forEach((item) => {
    timeline.push({
      id: `comment:${item.id}`,
      type: "comment",
      title: `Comentario de ${item.author || "equipo"}`,
      body: item.body || "",
      created_at: item.created_at,
      accent: "amber",
    });
  });

  reminders.forEach((item) => {
    timeline.push({
      id: `reminder:${item.id}`,
      type: "reminder",
      title: item.title || "Recordatorio",
      body: item.assigned_to
        ? `Asignado a ${item.assigned_to}`
        : "Recordatorio programado",
      created_at: item.remind_at || item.created_at,
      accent: "red",
    });
  });

  return timeline.sort(
    (left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
  );
}

export function buildDerivedNotifications({
  data,
  billingData,
  healthData,
  voiceQaData,
} = {}) {
  const alerts = data?.alerts || [];
  const metrics = data?.metrics || {};
  const notifications = [];
  const usage = computeUsagePressure({ data, billingData });

  alerts.forEach((alert) => {
    notifications.push({
      id: `alert:${alert.id}`,
      severity: alert.severity || "medium",
      title: alert.title || "Alerta",
      body: alert.message || "Actividad detectada",
      area: "alerts",
      view: "notifications",
      created_at: alert.created_at,
    });
  });

  if (metrics.unassignedLeads > 0) {
    notifications.push({
      id: "notif:unassigned",
      severity: metrics.unassignedLeads > 5 ? "high" : "medium",
      title: "Leads sin responsable",
      body: `Hay ${metrics.unassignedLeads} leads sin owner asignado.`,
      area: "pipeline",
      view: "team",
    });
  }

  if (usage.level === "high" || usage.level === "critical") {
    notifications.push({
      id: "notif:usage",
      severity: usage.level === "critical" ? "high" : "medium",
      title: "Uso cerca del límite",
      body: usage.recommendation,
      area: "billing",
      view: "billing",
    });
  }

  if (billingData?.pendingInvoicesCount > 0) {
    notifications.push({
      id: "notif:billing",
      severity: "high",
      title: "Facturas pendientes o fallidas",
      body: `Hay ${billingData.pendingInvoicesCount} facturas que requieren revisión.`,
      area: "billing",
      view: "billing",
    });
  }

  if (healthData?.summary?.level === "warning" || healthData?.summary?.level === "critical") {
    notifications.push({
      id: "notif:health",
      severity: healthData.summary.level === "critical" ? "high" : "medium",
      title: "Salud del sistema requiere atención",
      body: healthData.summary.message,
      area: "operations",
      view: "operations",
    });
  }

  if (voiceQaData?.summary?.needsAttention > 0) {
    notifications.push({
      id: "notif:voice-qa",
      severity: "medium",
      title: "Llamadas IA mejorables",
      body: `${voiceQaData.summary.needsAttention} llamadas recientes requieren revisión.`,
      area: "voice",
      view: "operations",
    });
  }

  return notifications
    .sort((left, right) => {
      const severityWeight = { high: 3, medium: 2, low: 1 };
      const severityDiff =
        (severityWeight[right.severity] || 0) - (severityWeight[left.severity] || 0);
      if (severityDiff !== 0) return severityDiff;

      return (
        new Date(right.created_at || 0).getTime() -
        new Date(left.created_at || 0).getTime()
      );
    })
    .slice(0, 24);
}

export function buildInboxThreads({
  leads = [],
  calls = [],
  events = [],
  reminders = [],
} = {}) {
  const leadMap = new Map();
  const phoneMap = new Map();

  (leads || []).forEach((lead) => {
    if (lead?.id) {
      leadMap.set(lead.id, lead);
    }

    const phone = normalizePhone(lead?.telefono);
    if (phone) {
      phoneMap.set(phone, lead);
    }
  });

  const threadMap = new Map();

  function ensureThread(lead) {
    if (!lead?.id) return null;

    if (!threadMap.has(lead.id)) {
      threadMap.set(lead.id, {
        id: lead.id,
        leadId: lead.id,
        leadName: lead.nombre || "Lead sin nombre",
        phone: lead.telefono || "",
        owner: lead.owner || "",
        status: lead.status || "new",
        score: toNumber(lead.score, 0),
        predicted_close_probability: toNumber(
          lead.predicted_close_probability,
          0
        ),
        interes: lead.interes || "",
        next_action: lead.next_action || "",
        next_action_priority: lead.next_action_priority || "media",
        valor_estimado: toNumber(lead.valor_estimado, 0),
        necesidad: lead.necesidad || "",
        updated_at: lead.updated_at || lead.created_at || null,
        lastActivityAt: lead.updated_at || lead.created_at || null,
        lastPreview: lead.necesidad || "Sin actividad reciente",
        lastChannel: "system",
        lastDirection: "system",
        requiresAttention: false,
        hasRecording: false,
        hasPayment: false,
        hasUpcomingReminder: false,
        unreadEstimate: 0,
        messageCount: 0,
        callCount: 0,
        items: [],
      });
    }

    return threadMap.get(lead.id);
  }

  (leads || []).forEach((lead) => {
    ensureThread(lead);
  });

  (events || []).forEach((event) => {
    const phone = normalizePhone(event?.phone);
    const lead = leadMap.get(event?.lead_id) || phoneMap.get(phone) || null;
    const thread = ensureThread(lead);
    if (!thread) return;

    const preview = formatEventPreview(event);
    const channel = getEventChannel(event?.type);
    const direction = getEventDirection(event?.type);
    const createdAt = event?.created_at || null;

    thread.items.push({
      id: `event:${event.id || `${thread.id}:${thread.items.length}`}`,
      type: "event",
      channel,
      direction,
      title: event?.title || event?.type || "Evento",
      preview,
      created_at: createdAt,
    });

    thread.messageCount += 1;

    if (!thread.lastActivityAt || new Date(createdAt) > new Date(thread.lastActivityAt)) {
      thread.lastActivityAt = createdAt;
      thread.lastPreview = preview;
      thread.lastChannel = channel;
      thread.lastDirection = direction;
    }

    if (direction === "in") {
      thread.unreadEstimate += 1;
    }

    if (String(event?.type || "").toLowerCase().includes("payment")) {
      thread.hasPayment = true;
    }
  });

  (calls || []).forEach((call) => {
    const phoneCandidates = [
      normalizePhone(call?.from_number),
      normalizePhone(call?.to_number),
    ].filter(Boolean);

    const lead =
      phoneCandidates.map((phone) => phoneMap.get(phone)).find(Boolean) || null;
    const thread = ensureThread(lead);
    if (!thread) return;

    const createdAt = call?.created_at || null;
    const preview =
      formatText(call?.summary) ||
      formatText(call?.summary_long) ||
      "Llamada registrada";

    thread.items.push({
      id: `call:${call.id || `${thread.id}:${thread.items.length}`}`,
      type: "call",
      channel: "voice",
      direction: "system",
      title: "Llamada",
      preview,
      created_at: createdAt,
      recording_url: call?.recording_url || "",
      duration_seconds: toNumber(call?.duration_seconds, 0),
    });

    thread.callCount += 1;

    if (call?.recording_url) {
      thread.hasRecording = true;
    }

    if (!thread.lastActivityAt || new Date(createdAt) > new Date(thread.lastActivityAt)) {
      thread.lastActivityAt = createdAt;
      thread.lastPreview = preview;
      thread.lastChannel = "voice";
      thread.lastDirection = "system";
    }
  });

  (reminders || []).forEach((reminder) => {
    const lead = leadMap.get(reminder?.lead_id) || null;
    const thread = ensureThread(lead);
    if (!thread) return;

    const createdAt = reminder?.remind_at || reminder?.created_at || null;

    thread.items.push({
      id: `reminder:${reminder.id || `${thread.id}:${thread.items.length}`}`,
      type: "reminder",
      channel: "system",
      direction: "system",
      title: reminder?.title || "Recordatorio",
      preview: reminder?.assigned_to
        ? `Asignado a ${reminder.assigned_to}`
        : "Recordatorio programado",
      created_at: createdAt,
    });

    if (createdAt && new Date(createdAt).getTime() >= Date.now()) {
      thread.hasUpcomingReminder = true;
    }
  });

  const threads = [...threadMap.values()]
    .map((thread) => {
      const sortedItems = thread.items.sort(
        (left, right) =>
          new Date(right.created_at || 0).getTime() -
          new Date(left.created_at || 0).getTime()
      );

      const latestInbound = sortedItems.find((item) => item.direction === "in");
      const latestOutbound = sortedItems.find((item) => item.direction === "out");

      const waitingForReply =
        latestInbound &&
        (!latestOutbound ||
          new Date(latestInbound.created_at || 0) >
            new Date(latestOutbound.created_at || 0));

      const isHot =
        thread.score >= 75 ||
        thread.predicted_close_probability >= 75 ||
        ["alta", "urgente", "high"].includes(
          String(thread.next_action_priority || "").toLowerCase()
        );

      return {
        ...thread,
        items: sortedItems.slice(0, 12),
        waitingForReply: Boolean(waitingForReply),
        requiresAttention:
          Boolean(waitingForReply) ||
          Boolean(thread.hasUpcomingReminder) ||
          (isHot && thread.status !== "won" && thread.status !== "lost"),
      };
    })
    .sort(
      (left, right) =>
        new Date(right.lastActivityAt || 0).getTime() -
        new Date(left.lastActivityAt || 0).getTime()
    );

  return {
    summary: {
      totalThreads: threads.length,
      requiresAttention: threads.filter((item) => item.requiresAttention).length,
      waitingForReply: threads.filter((item) => item.waitingForReply).length,
      withCalls: threads.filter((item) => item.callCount > 0).length,
      withRecordings: threads.filter((item) => item.hasRecording).length,
      withPayments: threads.filter((item) => item.hasPayment).length,
    },
    threads,
  };
}

export function buildOnboardingWorkspace({
  data,
  billingData,
  healthData,
  playbookData,
} = {}) {
  const checklist = buildOnboardingChecklist({ data, billingData, healthData });
  const client = data?.client || {};
  const settings = data?.settings || {};
  const users = data?.users || [];
  const integrations = [
    {
      id: "ai",
      name: "IA",
      ready: Boolean(healthData?.services?.ai?.ready),
      detail: healthData?.services?.ai?.detail || "Clave de IA y modelo operativo.",
      view: "playbooks",
    },
    {
      id: "voice",
      name: "Telefonía",
      ready: Boolean(healthData?.services?.telephony?.ready),
      detail:
        healthData?.services?.telephony?.detail ||
        "Número de voz, Twilio y flujo de llamadas.",
      view: "voice",
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      ready: Boolean(healthData?.services?.whatsapp?.ready),
      detail:
        healthData?.services?.whatsapp?.detail ||
        "Canal conversacional operativo.",
      view: "inbox",
    },
    {
      id: "billing",
      name: "Billing",
      ready: Boolean(
        billingData?.activeSubscription || client?.stripe_customer_id
      ),
      detail: "Stripe, plan activo y cobro preparados.",
      view: "billing",
    },
    {
      id: "reporting",
      name: "Reporting",
      ready: Boolean(
        settings?.daily_report_email || settings?.weekly_report_email
      ),
      detail: "Emails y seguimiento ejecutivo activos.",
      view: "settings",
    },
    {
      id: "playbook",
      name: "Playbook",
      ready: Boolean(playbookData?.workspace?.compiledPrompt || client?.prompt),
      detail: "Entrenamiento comercial y tono de marca definidos.",
      view: "playbooks",
    },
  ];

  const readinessScore = Math.round(
    (
      (checklist.progress || 0) +
      (integrations.filter((item) => item.ready).length / integrations.length) *
        100
    ) / 2
  );

  return {
    checklist,
    integrations,
    readinessScore,
    summary:
      readinessScore >= 85
        ? "La cuenta ya está en un punto muy vendible y operativa para escalar."
        : readinessScore >= 60
          ? "La base está bien, pero aún hay piezas por cerrar para que el sistema corra solo."
          : "Todavía faltan conexiones y activos clave para sacar todo el rendimiento.",
    nextActions: [
      checklist.nextStep
        ? {
            id: `checklist:${checklist.nextStep.id}`,
            title: checklist.nextStep.title,
            detail: checklist.nextStep.detail,
            view: checklist.nextStep.view,
          }
        : null,
      ...integrations
        .filter((item) => !item.ready)
        .slice(0, 3)
        .map((item) => ({
          id: `integration:${item.id}`,
          title: `Completar ${item.name}`,
          detail: item.detail,
          view: item.view,
        })),
      users.length < 2
        ? {
            id: "team",
            title: "Invitar al equipo",
            detail: "Añade al menos otro usuario con permisos para operar y revisar leads.",
            view: "team",
          }
        : null,
    ].filter(Boolean),
  };
}

export function buildRoiSnapshot({
  data,
  revenue,
  billingData,
  leadRevenue,
  ownerRevenue,
} = {}) {
  const metrics = data?.metrics || {};
  const settings = data?.settings || {};
  const topOwner = ownerRevenue?.ranking?.[0] || null;
  const topLead = leadRevenue?.topLeads?.[0] || null;
  const invoices = billingData?.invoices || [];
  const paidInvoice = invoices.find((item) => item.status === "paid") || null;

  const monthlyInvestment = toNumber(paidInvoice?.amount, 0);
  const totalRevenue = toNumber(revenue?.total || billingData?.totalRevenue, 0);
  const pipelineValue = toNumber(metrics.totalPotentialRevenue, 0);
  const revenuePerLead =
    metrics.totalLeads > 0 ? totalRevenue / metrics.totalLeads : 0;
  const revenuePerCall =
    metrics.totalCalls > 0 ? totalRevenue / metrics.totalCalls : 0;
  const winRate =
    metrics.totalLeads > 0
      ? Math.round((toNumber(metrics.wonLeads, 0) / metrics.totalLeads) * 100)
      : 0;
  const targetRevenue =
    toNumber(settings.monthly_target_leads, 0) *
    (toNumber(settings.monthly_target_conversion, 0) / 100) *
    toNumber(settings.default_deal_value, 0);
  const roiMultiple =
    monthlyInvestment > 0 ? Number((totalRevenue / monthlyInvestment).toFixed(1)) : null;

  return {
    summary: {
      totalRevenue,
      pipelineValue,
      monthlyInvestment,
      roiMultiple,
      revenuePerLead: Math.round(revenuePerLead),
      revenuePerCall: Math.round(revenuePerCall),
      winRate,
      targetRevenue: Math.round(targetRevenue),
    },
    story: [
      {
        id: "revenue",
        title: "Ingresos ya capturados",
        value: totalRevenue,
        detail:
          totalRevenue > 0
            ? "Ya hay retorno trazado directamente desde pagos y eventos de cierre."
            : "Todavía no hay ingresos capturados; el foco es activar cobro y cierre.",
      },
      {
        id: "pipeline",
        title: "Valor en pipeline",
        value: pipelineValue,
        detail:
          pipelineValue > 0
            ? "Este valor marca el upside inmediato si se gestiona bien el pipeline actual."
            : "Aún no hay valor estimado suficiente en pipeline.",
      },
      {
        id: "efficiency",
        title: "Ingreso por lead",
        value: Math.round(revenuePerLead),
        detail: "Ayuda a explicar cuánto valor medio genera cada oportunidad creada.",
      },
    ],
    focusAreas: [
      {
        id: "roi",
        title: roiMultiple ? `ROI estimado x${roiMultiple}` : "ROI todavía sin base cerrada",
        body: roiMultiple
          ? "Comparando ingresos trazados contra la última factura pagada, la cuenta ya devuelve múltiplos claros."
          : "En cuanto haya una factura pagada y ventas trazadas, el múltiplo ROI quedará visible aquí.",
      },
      {
        id: "target",
        title: "Meta mensual",
        body:
          targetRevenue > 0
            ? `Con los objetivos actuales, la cuenta apunta a ${Math.round(
                targetRevenue
              )}€ al mes.`
            : "Configura metas mensuales para traducir actividad en objetivo económico.",
      },
      {
        id: "owners",
        title: "Mejor responsable",
        body: topOwner
          ? `${topOwner.owner || "Equipo"} lidera con ${Math.round(
              toNumber(topOwner.revenue, 0)
            )}€ generados.`
          : "Todavía no hay ranking por responsable suficiente.",
      },
      {
        id: "lead",
        title: "Lead más valioso",
        body: topLead
          ? `${topLead.customer_name || "Lead"} ya suma ${Math.round(
              toNumber(topLead.total_revenue, 0)
            )}€ en ingresos.`
          : "Todavía no hay lead con ingreso destacado.",
      },
    ],
  };
}
