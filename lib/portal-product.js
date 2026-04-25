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

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 1)) * 100);
}

function normalizeString(value = "") {
  return String(value || "").trim().toLowerCase();
}

function average(values = []) {
  if (!values.length) return 0;
  return Math.round(
    values.reduce((acc, value) => acc + Number(value || 0), 0) / values.length
  );
}

export function buildProductPerformanceSnapshot({
  products = [],
  payments = [],
} = {}) {
  const grouped = new Map();

  (products || []).forEach((product) => {
    const key =
      normalizeString(product?.tier) ||
      normalizeString(product?.name) ||
      `product:${product?.id || Math.random()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        tier: product?.tier || "unknown",
        name: product?.name || product?.tier || "Producto",
        description: product?.description || "",
        price: toNumber(product?.price, 0),
        active: product?.active !== false,
        sales: 0,
        revenue: 0,
      });
    }
  });

  (payments || []).forEach((payment) => {
    const key =
      normalizeString(payment?.product_tier) ||
      normalizeString(payment?.product_name) ||
      "unknown";

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        tier: payment?.product_tier || "unknown",
        name: payment?.product_name || payment?.product_tier || "Producto",
        description: "",
        price: 0,
        active: true,
        sales: 0,
        revenue: 0,
      });
    }

    const current = grouped.get(key);
    current.sales += 1;
    current.revenue += toNumber(payment?.amount, 0);
  });

  const rows = [...grouped.values()]
    .map((row) => ({
      ...row,
      avgTicket: row.sales > 0 ? Math.round(row.revenue / row.sales) : 0,
    }))
    .sort((left, right) => right.revenue - left.revenue);

  const totalRevenue = rows.reduce(
    (acc, row) => acc + Number(row.revenue || 0),
    0
  );
  const totalSales = rows.reduce((acc, row) => acc + Number(row.sales || 0), 0);

  return {
    summary: {
      totalProducts: rows.length,
      totalRevenue,
      totalSales,
      bestProduct: rows[0] || null,
    },
    rows: rows.map((row) => ({
      ...row,
      share: totalRevenue > 0 ? percentage(row.revenue, totalRevenue) : 0,
    })),
  };
}

export function buildMessageExperimentSummary({
  variants = [],
  results = [],
  smsTemplates = [],
  whatsappTemplates = [],
} = {}) {
  const eventBuckets = new Map();

  (results || []).forEach((result) => {
    if (!result?.variant_id) return;

    if (!eventBuckets.has(result.variant_id)) {
      eventBuckets.set(result.variant_id, {
        sent: 0,
        replied: 0,
        converted: 0,
      });
    }

    const bucket = eventBuckets.get(result.variant_id);
    const eventType = normalizeString(result.event_type);

    if (eventType === "sent") bucket.sent += 1;
    if (eventType === "reply") bucket.replied += 1;
    if (eventType === "converted") bucket.converted += 1;
  });

  const enriched = (variants || [])
    .map((variant) => {
      const bucket = eventBuckets.get(variant.id) || {
        sent: 0,
        replied: 0,
        converted: 0,
      };

      return {
        ...variant,
        sent: bucket.sent,
        replied: bucket.replied,
        converted: bucket.converted,
        reply_rate: bucket.sent > 0 ? percentage(bucket.replied, bucket.sent) : 0,
        conversion_rate:
          bucket.sent > 0 ? percentage(bucket.converted, bucket.sent) : 0,
        confidence:
          bucket.sent >= 20 ? "high" : bucket.sent >= 8 ? "medium" : "low",
      };
    })
    .sort((left, right) => {
      if (right.conversion_rate !== left.conversion_rate) {
        return right.conversion_rate - left.conversion_rate;
      }

      if (right.reply_rate !== left.reply_rate) {
        return right.reply_rate - left.reply_rate;
      }

      return right.sent - left.sent;
    });

  const totalSent = enriched.reduce((acc, item) => acc + item.sent, 0);
  const totalReplies = enriched.reduce((acc, item) => acc + item.replied, 0);
  const totalConverted = enriched.reduce((acc, item) => acc + item.converted, 0);
  const liveVariants = enriched.filter((item) => item.sent > 0);
  const winner = liveVariants[0] || enriched[0] || null;

  const channelBreakdown = Object.values(
    enriched.reduce((acc, item) => {
      const key = item.channel || "unknown";
      if (!acc[key]) {
        acc[key] = {
          channel: key,
          variants: 0,
          sent: 0,
          replied: 0,
          converted: 0,
        };
      }

      acc[key].variants += 1;
      acc[key].sent += item.sent;
      acc[key].replied += item.replied;
      acc[key].converted += item.converted;
      return acc;
    }, {})
  ).map((item) => ({
    ...item,
    reply_rate: item.sent > 0 ? percentage(item.replied, item.sent) : 0,
    conversion_rate: item.sent > 0 ? percentage(item.converted, item.sent) : 0,
  }));

  const stageBreakdown = Object.values(
    enriched.reduce((acc, item) => {
      const key = item.stage || "general";
      if (!acc[key]) {
        acc[key] = {
          stage: key,
          variants: 0,
          sent: 0,
          replied: 0,
          converted: 0,
        };
      }

      acc[key].variants += 1;
      acc[key].sent += item.sent;
      acc[key].replied += item.replied;
      acc[key].converted += item.converted;
      return acc;
    }, {})
  ).map((item) => ({
    ...item,
    reply_rate: item.sent > 0 ? percentage(item.replied, item.sent) : 0,
    conversion_rate: item.sent > 0 ? percentage(item.converted, item.sent) : 0,
  }));

  const suggestions = [];

  if (totalSent === 0) {
    suggestions.push({
      id: "start-tests",
      title: "Activa pruebas reales ya",
      body:
        "Todavía no hay volumen suficiente de tests. Lanza al menos una variante de WhatsApp y otra de follow-up para empezar a aprender.",
    });
  }

  if (winner?.channel === "whatsapp" && winner.reply_rate >= 15) {
    suggestions.push({
      id: "double-down-whatsapp",
      title: "Dobla la apuesta en WhatsApp",
      body:
        "WhatsApp ya está enseñando mejor señal de respuesta. Conviene mover más volumen de follow-up ahí.",
    });
  }

  if (
    stageBreakdown.find((item) => item.stage === "seguimiento")?.reply_rate < 10 &&
    totalSent > 0
  ) {
    suggestions.push({
      id: "tighten-followup",
      title: "Aprieta el follow-up",
      body:
        "El seguimiento está generando poca respuesta. Reduce longitud y deja una sola llamada a la acción.",
    });
  }

  if (totalConverted === 0 && totalSent > 12) {
    suggestions.push({
      id: "test-closing",
      title: "Testea cierres más directos",
      body:
        "Hay volumen suficiente para probar cierres con propuesta de cita, demo o pago más explícita.",
    });
  }

  if (suggestions.length < 4 && smsTemplates.length > 0) {
    suggestions.push({
      id: "sms-template",
      title: "Probar variante SMS premium",
      body: `Conviene testear una versión breve inspirada en "${smsTemplates[0]?.name || "Seguimiento general"}".`,
    });
  }

  if (suggestions.length < 4 && whatsappTemplates.length > 0) {
    suggestions.push({
      id: "wa-template",
      title: "Abrir test de WhatsApp",
      body: `Usa como base "${whatsappTemplates[0]?.name || "WhatsApp seguimiento"}" y prueba un CTA más concreto.`,
    });
  }

  return {
    variants: enriched,
    summary: {
      totalVariants: enriched.length,
      activeVariants: liveVariants.length,
      totalSent,
      totalReplies,
      totalConverted,
      replyRate: totalSent > 0 ? percentage(totalReplies, totalSent) : 0,
      conversionRate: totalSent > 0 ? percentage(totalConverted, totalSent) : 0,
      coverage: enriched.length > 0 ? percentage(liveVariants.length, enriched.length) : 0,
      winner,
    },
    channelBreakdown,
    stageBreakdown,
    suggestions: suggestions.slice(0, 4),
  };
}

export function buildAdvancedAiInsights({
  client = {},
  settings = {},
  leads = [],
  calls = [],
  payments = [],
  experiments = null,
  productPerformance = [],
  ownerRanking = [],
} = {}) {
  const insights = [];
  const totalLeads = leads.length;
  const wonLeads = leads.filter((lead) => lead.status === "won").length;
  const qualifiedLeads = leads.filter((lead) => lead.status === "qualified").length;
  const unassignedLeads = leads.filter((lead) => !lead.owner).length;
  const hotOpenLeads = leads.filter((lead) => {
    const probability = toNumber(
      lead.predicted_close_probability || lead.score,
      0
    );
    const status = normalizeString(lead.status);
    return probability >= 75 && status !== "won" && status !== "lost";
  }).length;

  const winRate = totalLeads > 0 ? percentage(wonLeads, totalLeads) : 0;
  const qualificationRate =
    totalLeads > 0 ? percentage(qualifiedLeads, totalLeads) : 0;
  const targetLeads = toNumber(settings.monthly_target_leads, 0);
  const targetConversion = toNumber(settings.monthly_target_conversion, 0);
  const totalRevenue = (payments || []).reduce(
    (acc, payment) => acc + toNumber(payment.amount, 0),
    0
  );
  const avgQa = average((calls || []).map((call) => scoreVoiceCallQA(call).overall));
  const topProduct = (productPerformance || [])[0] || null;
  const topOwner = (ownerRanking || [])[0] || null;

  if (hotOpenLeads >= 3) {
    insights.push({
      id: "close-hot-leads",
      category: "conversion",
      priority: 96,
      title: "Hay intención lista para cerrar",
      body: `Tienes ${hotOpenLeads} leads muy calientes todavía abiertos. El cuello de botella no es captación, es cierre y follow-up.`,
      view: "pipeline",
    });
  }

  if (targetLeads > 0 && totalLeads < targetLeads) {
    insights.push({
      id: "lead-gap",
      category: "growth",
      priority: 88,
      title: "La meta de leads aún está por debajo",
      body: `La cuenta va en ${totalLeads}/${targetLeads} leads frente a la meta configurada. Conviene reforzar adquisición o automatización temprana.`,
      view: "onboarding",
    });
  }

  if (targetConversion > 0 && winRate < targetConversion) {
    insights.push({
      id: "conversion-gap",
      category: "revenue",
      priority: 91,
      title: "La conversión real está por debajo del objetivo",
      body: `La meta es ${targetConversion}% y ahora mismo la cuenta está en ${winRate}%. Hay margen claro en cierre, playbooks y timing.`,
      view: "playbooks",
    });
  }

  if (experiments?.summary?.totalSent > 0 && experiments.summary.replyRate < 12) {
    insights.push({
      id: "experiment-quality",
      category: "experiments",
      priority: 82,
      title: "Los mensajes necesitan iteración",
      body: `Los tests activos ya tienen volumen, pero la respuesta sigue en ${experiments.summary.replyRate}%. Toca simplificar copy y CTA.`,
      view: "experiments",
    });
  } else if (!experiments?.summary?.totalSent) {
    insights.push({
      id: "no-experiments",
      category: "experiments",
      priority: 84,
      title: "Falta aprendizaje experimental",
      body:
        "Todavía no hay tests suficientes de mensajes. Sin esa señal, el crecimiento depende demasiado de intuición manual.",
      view: "experiments",
    });
  }

  if (avgQa > 0 && avgQa < 62) {
    insights.push({
      id: "voice-qa",
      category: "voice",
      priority: 78,
      title: "La voz puede sonar bastante mejor",
      body: `La calidad media de llamada está en ${avgQa}/100. Ajustar apertura, empatía y cierre probablemente suba conversión sin tocar tráfico.`,
      view: "voice",
    });
  }

  if (unassignedLeads > 0) {
    insights.push({
      id: "ownership",
      category: "ops",
      priority: 76,
      title: "Hay leads sin owner",
      body: `${unassignedLeads} leads siguen sin responsable claro. Eso suele traducirse en seguimiento irregular y pérdida de velocidad comercial.`,
      view: "team",
    });
  }

  if (topProduct && topProduct.share >= 60) {
    insights.push({
      id: "top-product",
      category: "expansion",
      priority: 73,
      title: "Ya hay un producto ganador",
      body: `${topProduct.name || topProduct.tier} concentra ${topProduct.share}% del revenue trazado. Tiene sentido doblar esfuerzos ahí y diseñar el upsell alrededor.`,
      view: "strategy",
    });
  }

  if (topOwner && ownerRanking.length > 1) {
    insights.push({
      id: "team-playbook",
      category: "team",
      priority: 69,
      title: "Hay un patrón ganador en el equipo",
      body: `${topOwner.owner || "El mejor responsable"} ya está marcando la referencia de ingresos. Conviene capturar su secuencia y replicarla en el resto del equipo.`,
      view: "team",
    });
  }

  if (totalRevenue > 0 && !client?.stripe_customer_id) {
    insights.push({
      id: "billing-ops",
      category: "billing",
      priority: 65,
      title: "El retorno ya existe; la capa de billing debe quedar perfecta",
      body:
        "Ya hay ingresos trazados y merece la pena dejar billing, portal y upgrades totalmente cerrados para no perder expansión.",
      view: "billing",
    });
  }

  return insights.sort(
    (left, right) => Number(right.priority || 0) - Number(left.priority || 0)
  );
}

export function buildStrategySnapshot({
  client = {},
  settings = {},
  leads = [],
  calls = [],
  payments = [],
  benchmarks = [],
  experiments = null,
  productPerformance = [],
  ownerRanking = [],
} = {}) {
  const totalLeads = leads.length;
  const wonLeads = leads.filter((lead) => lead.status === "won").length;
  const assignedLeads = leads.filter((lead) => Boolean(lead.owner)).length;
  const winRate = totalLeads > 0 ? percentage(wonLeads, totalLeads) : 0;
  const assignedRate = totalLeads > 0 ? percentage(assignedLeads, totalLeads) : 0;
  const totalRevenue = (payments || []).reduce(
    (acc, payment) => acc + toNumber(payment.amount, 0),
    0
  );
  const targetLeads = toNumber(settings.monthly_target_leads, 0);
  const targetConversion = toNumber(settings.monthly_target_conversion, 0);
  const experimentCoverage = toNumber(experiments?.summary?.coverage, 0);
  const topProduct = (productPerformance || [])[0] || null;

  const benchmarkCards = [
    {
      id: "leads",
      label: "Meta de leads",
      value: totalLeads,
      target: targetLeads || null,
      delta: targetLeads > 0 ? totalLeads - targetLeads : 0,
      status:
        targetLeads > 0
          ? totalLeads >= targetLeads
            ? "healthy"
            : totalLeads >= targetLeads * 0.7
              ? "warning"
              : "critical"
          : "neutral",
      detail:
        targetLeads > 0
          ? `La cuenta va en ${totalLeads}/${targetLeads} leads frente a su objetivo actual.`
          : "Configura una meta mensual para medir adquisición con contexto.",
    },
    {
      id: "conversion",
      label: "Conversión a ganado",
      value: `${winRate}%`,
      target: targetConversion > 0 ? `${targetConversion}%` : null,
      delta: targetConversion > 0 ? winRate - targetConversion : 0,
      status:
        targetConversion > 0
          ? winRate >= targetConversion
            ? "healthy"
            : winRate >= targetConversion * 0.7
              ? "warning"
              : "critical"
          : "neutral",
      detail:
        targetConversion > 0
          ? `La conversión actual es ${winRate}% frente a una meta del ${targetConversion}%.`
          : "Configura la meta de conversión para valorar la eficiencia real del funnel.",
    },
    {
      id: "ownership",
      label: "Cobertura de owner",
      value: `${assignedRate}%`,
      target: "100%",
      delta: assignedRate - 100,
      status:
        assignedRate >= 95 ? "healthy" : assignedRate >= 75 ? "warning" : "critical",
      detail:
        assignedRate >= 95
          ? "Casi todo el pipeline tiene responsable claro."
          : "Todavía hay oportunidades sin owner fijo, lo que frena seguimiento y accountability.",
    },
    {
      id: "experiments",
      label: "Cobertura experimental",
      value: `${experimentCoverage}%`,
      target: "60%",
      delta: experimentCoverage - 60,
      status:
        experimentCoverage >= 60
          ? "healthy"
          : experimentCoverage >= 30
            ? "warning"
            : "critical",
      detail:
        experimentCoverage > 0
          ? "Mide cuántas variantes activas ya están aprendiendo con señal real."
          : "Todavía no hay suficiente señal experimental.",
    },
  ];

  const normalizedBenchmarkHistory = (benchmarks || [])
    .slice(0, 8)
    .map((item, index) => ({
      id: item?.id || `benchmark:${index}`,
      label:
        item?.metric_name ||
        item?.name ||
        item?.title ||
        item?.metric ||
        `Snapshot ${index + 1}`,
      value:
        item?.metric_value ??
        item?.value ??
        item?.score ??
        item?.status ??
        "—",
      detail:
        item?.notes ||
        item?.detail ||
        item?.description ||
        item?.period ||
        "",
      created_at: item?.created_at || null,
    }));

  const insights = buildAdvancedAiInsights({
    client,
    settings,
    leads,
    calls,
    payments,
    experiments,
    productPerformance,
    ownerRanking,
  });

  return {
    summaryCards: [
      {
        id: "revenue",
        label: "Revenue trazado",
        value: Math.round(totalRevenue),
        suffix: "EUR",
        detail:
          totalRevenue > 0
            ? "Ingresos ya atribuidos a la cuenta."
            : "Aún no hay revenue trazado en eventos de pago.",
      },
      {
        id: "signals",
        label: "Insights prioritarios",
        value: insights.length,
        detail: "Lecturas accionables generadas a partir de señal real.",
      },
      {
        id: "benchmarks",
        label: "Benchmarks activos",
        value: benchmarkCards.length,
        detail: "KPIs estratégicos que marcan dirección y fricción.",
      },
      {
        id: "focus",
        label: "Producto líder",
        value: topProduct?.name || topProduct?.tier || "Sin ganador claro",
        detail: topProduct
          ? `${topProduct.share}% del revenue actual llega desde aquí.`
          : "Todavía no hay suficiente señal para identificar producto estrella.",
      },
    ],
    benchmarkCards,
    benchmarkHistory: normalizedBenchmarkHistory,
    insights,
    productFocus: (productPerformance || []).slice(0, 6),
    ownerFocus: (ownerRanking || []).slice(0, 6),
    experiments: experiments?.summary || null,
    story:
      insights[0]?.body ||
      "La cuenta tiene base suficiente para escalar, pero conviene afinar los próximos movimientos con más señal.",
  };
}

export function buildBrandLabWorkspace({
  client = {},
  settings = {},
  products = [],
  services = {},
} = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || "";
  const previewPath = client?.id ? `/c/${client.id}` : "/pricing";
  const previewUrl = baseUrl ? `${baseUrl}${previewPath}` : previewPath;
  const loginUrl = baseUrl ? `${baseUrl}/login` : "/login";
  const domain = formatText(client?.custom_domain);

  const integrations = [
    {
      id: "domain",
      name: "Dominio",
      ready: Boolean(domain),
      detail: domain
        ? `Dominio configurado: ${domain}`
        : "Todavía no hay dominio conectado para white-label.",
    },
    {
      id: "voice",
      name: "Telefonía",
      ready: Boolean(services?.telephony?.ready),
      detail:
        services?.telephony?.detail ||
        "Número, proveedor y flujo de voz listos para producción.",
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      ready: Boolean(services?.whatsapp?.ready),
      detail:
        services?.whatsapp?.detail ||
        "Canal conversacional preparado para seguimiento.",
    },
    {
      id: "billing",
      name: "Billing",
      ready: Boolean(services?.billing?.ready),
      detail:
        services?.billing?.detail ||
        "Stripe y gestión de facturación operativos.",
    },
    {
      id: "reporting",
      name: "Reporting",
      ready: Boolean(
        settings?.daily_report_email || settings?.weekly_report_email
      ),
      detail:
        settings?.daily_report_email || settings?.weekly_report_email
          ? "La cuenta ya envía reporting automático."
          : "Configura reporting diario o semanal para dejar la capa ejecutiva lista.",
    },
    {
      id: "webhook",
      name: "Webhook / integraciones",
      ready: Boolean(client?.webhook),
      detail: client?.webhook
        ? "Hay endpoint conectado para sincronizaciones externas."
        : "Falta conectar webhook o integraciones salientes.",
    },
  ];

  const readinessScore = Math.round(
    (integrations.filter((item) => item.ready).length / integrations.length) * 100
  );

  const suggestions = [
    !client?.logo_text
      ? {
          id: "logo-text",
          title: "Define la marca visible",
          body:
            "Añade texto corto o iniciales de marca para que el white-label tenga identidad propia incluso sin logo remoto.",
        }
      : null,
    !domain
      ? {
          id: "domain",
          title: "Conecta un dominio propio",
          body:
            "Un dominio del cliente eleva muchísimo la percepción de producto serio y reduce fricción comercial.",
        }
      : null,
    !client?.tagline
      ? {
          id: "tagline",
          title: "Añade una propuesta de valor corta",
          body:
            "La tagline define en segundos qué hace el sistema y por qué parece premium desde fuera.",
        }
      : null,
    !client?.webhook
      ? {
          id: "integration",
          title: "Cierra la capa de integraciones",
          body:
            "Conecta un webhook saliente o integración para que el white-label no viva aislado.",
        }
      : null,
  ].filter(Boolean);

  return {
    preview: {
      brandName: client?.brand_name || client?.name || "Nesped",
      logoText:
        client?.logo_text ||
        (client?.brand_name || client?.name || "N").slice(0, 1).toUpperCase(),
      logoUrl: client?.brand_logo_url || "",
      tagline:
        client?.tagline || "Revenue OS premium con voz, CRM y automatización.",
      primaryColor: client?.primary_color || "#ffffff",
      secondaryColor: client?.secondary_color || "#030303",
      theme: {
        accent: client?.accent || "bg-blue-500/20",
        accentText: client?.accent_text || "text-blue-300",
        button: client?.button || "bg-white text-black hover:bg-white/90",
        badge: client?.badge || "bg-emerald-500/15 text-emerald-300",
      },
      previewUrl,
      loginUrl,
      domainUrl: domain ? `https://${domain}` : "",
      customDomain: domain,
    },
    integrations,
    readinessScore,
    readinessState:
      readinessScore >= 85
        ? "ready"
        : readinessScore >= 60
          ? "progress"
          : "setup",
    suggestions,
    catalog: (products || []).map((product) => ({
      id: product.id,
      name: product.name,
      tier: product.tier,
      price: toNumber(product.price, 0),
      description: product.description || "",
      active: product.active !== false,
      features: String(product.features || "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4),
    })),
  };
}

export function buildAccessCenterSnapshot({
  users = [],
  policies = {},
  auditLogs = [],
} = {}) {
  const activeUsers = (users || []).filter((user) => user.is_active !== false);
  const inactiveUsers = (users || []).filter((user) => user.is_active === false);
  const elevatedUsers = activeUsers.filter((user) =>
    ["owner", "admin", "manager"].includes(normalizeString(user.role))
  );
  const usersWithoutPassword = activeUsers.filter((user) => !user.hasPassword);
  const usersRequiringTwoFactor = activeUsers.filter(
    (user) => user.requiresTwoFactor
  );
  const owners = activeUsers.filter(
    (user) => normalizeString(user.role) === "owner"
  );

  const recommendations = [];

  if (owners.length === 0) {
    recommendations.push({
      id: "owner-missing",
      title: "Falta un owner claro",
      body:
        "Conviene que al menos una persona tenga ownership total del cliente para evitar bloqueos operativos.",
    });
  }

  if (usersWithoutPassword.length > 0) {
    recommendations.push({
      id: "password-missing",
      title: "Hay usuarios sin contraseña gestionada",
      body: `${usersWithoutPassword.length} usuarios activos todavía no tienen password cerrada en la capa de acceso.`,
    });
  }

  if (!policies.secureCookie) {
    recommendations.push({
      id: "secure-cookie",
      title: "La cookie segura no está activa",
      body:
        "En producción conviene que el portal se sirva siempre bajo HTTPS para que la sesión vaya con cookie secure.",
    });
  }

  if (!policies.secretConfigured) {
    recommendations.push({
      id: "session-secret",
      title: "Falta un secreto de sesión dedicado",
      body:
        "Define NESPED_SESSION_SECRET para separar la firma de sesión del resto de secretos internos.",
    });
  }

  if (
    usersRequiringTwoFactor.length > 0 &&
    policies?.twoFactor?.delivery === "not_configured"
  ) {
    recommendations.push({
      id: "two-factor-delivery",
      title: "2FA exige una vía de entrega",
      body:
        "Los roles owner/admin requieren verificación reforzada. Configura RESEND_API_KEY para entregar los códigos por email en producción.",
    });
  }

  return {
    summary: {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      inactiveUsers: inactiveUsers.length,
      elevatedUsers: elevatedUsers.length,
      usersWithoutPassword: usersWithoutPassword.length,
      usersRequiringTwoFactor: usersRequiringTwoFactor.length,
      recommendations: recommendations.length,
    },
    roleMatrix: [
      {
        role: "owner",
        label: "Owner",
        capabilities: ["billing", "branding", "team", "security", "api"],
      },
      {
        role: "admin",
        label: "Admin",
        capabilities: ["crm", "automations", "team", "reporting"],
      },
      {
        role: "manager",
        label: "Manager",
        capabilities: ["pipeline", "voice", "inbox", "reporting"],
      },
      {
        role: "agent",
        label: "Agent",
        capabilities: ["leads", "followup", "voice"],
      },
      {
        role: "viewer",
        label: "Viewer",
        capabilities: ["analytics", "roi"],
      },
    ],
    policies,
    users,
    auditLogs: auditLogs.slice(0, 20),
    recommendations,
  };
}

export function buildApiHubWorkspace({
  client = {},
  settings = {},
  services = {},
  baseUrl = "",
  domainStatus = null,
} = {}) {
  const safeBaseUrl = String(baseUrl || "").replace(/\/$/, "");
  const brandName = client?.brand_name || client?.name || "Nesped";
  const publicLandingUrl = safeBaseUrl ? `${safeBaseUrl}/c/${client.id}` : `/c/${client.id}`;
  const loginUrl = safeBaseUrl ? `${safeBaseUrl}/login` : "/login";
  const portalUrl = safeBaseUrl ? `${safeBaseUrl}/portal` : "/portal";
  const customDomain = formatText(client?.custom_domain);
  const customDomainUrl = customDomain ? `https://${customDomain}` : "";

  const endpoints = [
    {
      id: "landing",
      name: "White-label landing",
      method: "GET",
      url: customDomainUrl || publicLandingUrl,
      description: "Página pública del cliente para demo y captación.",
    },
    {
      id: "portal",
      name: "Portal clientes",
      method: "GET",
      url: portalUrl,
      description: "Acceso al backoffice premium del cliente.",
    },
    {
      id: "public-client",
      name: "Metadata pública",
      method: "GET",
      url: safeBaseUrl ? `${safeBaseUrl}/api/public-client` : "/api/public-client",
      description: "Devuelve branding y tema público del cliente según dominio/subdominio.",
    },
    {
      id: "demo-call",
      name: "Demo call",
      method: "POST",
      url: safeBaseUrl ? `${safeBaseUrl}/api/demo-call` : "/api/demo-call",
      description: "Lanza una llamada demo protegida con rate limit y grabación.",
    },
    {
      id: "webhook",
      name: "Webhook saliente",
      method: "POST",
      url: client?.webhook || "No configurado",
      description: "Destino para eventos salientes de Nesped hacia el stack del cliente.",
    },
  ];

  const eventCatalog = [
    {
      id: "lead_captured",
      title: "lead_captured",
      body: `Evento saliente cuando ${brandName} captura o sincroniza un lead nuevo.`,
      payload: {
        event: "lead_captured",
        client_id: client?.id || "",
        lead: {
          id: "lead_123",
          name: "Lead demo",
          phone: "+34600000000",
          status: "new",
        },
      },
    },
    {
      id: "voice_summary",
      title: "voice_summary",
      body: "Resumen de llamada, intención y grabación para enriquecer CRM o BI externos.",
      payload: {
        event: "voice_summary",
        client_id: client?.id || "",
        call: {
          result: "qualified",
          duration_seconds: 183,
          recording_url: "https://...",
        },
      },
    },
    {
      id: "payment_completed",
      title: "payment_completed",
      body: "Confirmación de cobro con importe, producto y sesión de checkout.",
      payload: {
        event: "payment_completed",
        client_id: client?.id || "",
        payment: {
          amount_total: 299,
          product_tier: "pro",
          checkout_session_id: "cs_test_123",
        },
      },
    },
  ];

  const integrations = [
    {
      id: "domain",
      name: "Custom domain",
      ready: Boolean(customDomain),
      detail: customDomain
        ? `Dominio activo: ${customDomain}`
        : "Aún no hay dominio propio conectado.",
    },
    {
      id: "webhook",
      name: "Outbound webhook",
      ready: Boolean(client?.webhook),
      detail: client?.webhook
        ? "Hay endpoint saliente configurado."
        : "Falta conectar un endpoint externo.",
    },
    {
      id: "voice",
      name: "Voice",
      ready: Boolean(services?.telephony?.ready),
      detail: services?.telephony?.detail || "Capa de voz operativa.",
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      ready: Boolean(services?.whatsapp?.ready),
      detail: services?.whatsapp?.detail || "Canal conversacional operativo.",
    },
    {
      id: "billing",
      name: "Stripe / billing",
      ready: Boolean(services?.billing?.ready),
      detail: services?.billing?.detail || "Facturación conectada.",
    },
    {
      id: "reporting",
      name: "Reporting",
      ready: Boolean(
        settings?.daily_report_email || settings?.weekly_report_email
      ),
      detail:
        settings?.daily_report_email || settings?.weekly_report_email
          ? "Reporting activo para stakeholders."
          : "Activa reporting para cerrar la capa ejecutiva.",
    },
  ];

  const readinessScore = Math.round(
    (integrations.filter((item) => item.ready).length / integrations.length) * 100
  );

  return {
    summary: {
      readinessScore,
      endpoints: endpoints.length,
      configuredIntegrations: integrations.filter((item) => item.ready).length,
      publicSurface: customDomainUrl || publicLandingUrl,
    },
    urls: {
      loginUrl,
      portalUrl,
      publicLandingUrl,
      customDomainUrl,
    },
    endpoints,
    integrations,
    eventCatalog,
    domainStatus,
    recipes: [
      {
        id: "crm",
        title: "Enviar leads al CRM externo",
        body:
          "Usa el outbound webhook para reenviar lead, score, owner y siguiente acción al CRM o BI del cliente.",
      },
      {
        id: "billing",
        title: "Sincronizar cobros en backoffice",
        body:
          "Escucha payment_completed para reflejar upgrades, cierres o renovaciones en sistemas externos.",
      },
      {
        id: "ops",
        title: "Montar alerting operativo",
        body:
          "Los eventos de voz, pagos y lead capture permiten avisos internos en Slack, email o herramientas low-code.",
      },
    ],
  };
}

export function buildControlTowerSnapshot({
  data,
  billingData,
  healthData,
  voiceQaData,
  experimentSnapshot,
} = {}) {
  const leads = data?.leads || [];
  const calls = data?.calls || [];
  const alerts = data?.alerts || [];
  const auditLogs = data?.auditLogs || [];
  const now = Date.now();
  const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const normalizedRecentCallPhones = new Set(
    calls
      .filter((call) => {
        const createdAt = call?.created_at
          ? new Date(call.created_at).getTime()
          : 0;
        return createdAt >= now - sevenDaysMs;
      })
      .flatMap((call) => [
        normalizePhone(call?.from_number),
        normalizePhone(call?.to_number),
      ])
      .filter(Boolean)
  );

  const openLeads = leads.filter(
    (lead) => !["won", "lost"].includes(normalizeString(lead.status))
  );
  const stalledLeads = openLeads.filter((lead) => {
    const updatedAt = lead?.updated_at || lead?.created_at;
    return updatedAt && new Date(updatedAt).getTime() < now - fifteenDaysMs;
  });
  const hotVoiceCandidates = openLeads.filter((lead) => {
    const score = toNumber(lead.score || lead.predicted_close_probability, 0);
    const phone = normalizePhone(lead.telefono);
    return score >= 75 && phone && !normalizedRecentCallPhones.has(phone);
  });
  const reactivationCandidates = stalledLeads.filter((lead) =>
    !lead.followup_sms_sent
  );
  const nextActionGap = openLeads.filter(
    (lead) => !formatText(lead.next_action) && !formatText(lead.next_step_ai)
  );
  const pendingInvoices = toNumber(billingData?.pendingInvoicesCount, 0);
  const healthLevel = normalizeString(healthData?.summary?.level);
  const voiceNeedsAttention = toNumber(voiceQaData?.summary?.needsAttention, 0);
  const experimentCoverage = toNumber(experimentSnapshot?.summary?.coverage, 0);

  const workflows = [
    {
      id: "funnel",
      name: "Funnel automático",
      eligible: openLeads.length,
      status:
        openLeads.length >= 25 ? "warning" : openLeads.length > 0 ? "healthy" : "low",
      detail:
        openLeads.length > 0
          ? `${openLeads.length} leads siguen activos en pipeline y pueden beneficiarse de automatización.`
          : "No hay leads abiertos ahora mismo.",
      actionId: "runAutomaticFunnel",
      view: "automations",
    },
    {
      id: "reactivation",
      name: "Reactivación",
      eligible: reactivationCandidates.length,
      status:
        reactivationCandidates.length >= 8
          ? "critical"
          : reactivationCandidates.length > 0
            ? "warning"
            : "healthy",
      detail:
        reactivationCandidates.length > 0
          ? `${reactivationCandidates.length} leads están fríos y sin follow-up reciente.`
          : "No hay deuda importante de reactivación.",
      actionId: "runColdLeadReactivation",
      view: "automations",
    },
    {
      id: "voice",
      name: "Voice outreach",
      eligible: hotVoiceCandidates.length,
      status:
        hotVoiceCandidates.length >= 5
          ? "warning"
          : hotVoiceCandidates.length > 0
            ? "healthy"
            : "low",
      detail:
        hotVoiceCandidates.length > 0
          ? `${hotVoiceCandidates.length} leads calientes aún no han recibido una llamada reciente.`
          : "La cola de llamadas está al día.",
      actionId: "runVoiceCalls",
      view: "voice",
    },
    {
      id: "priority",
      name: "Prioridad y NBA",
      eligible: nextActionGap.length,
      status:
        nextActionGap.length >= 10
          ? "critical"
          : nextActionGap.length > 0
            ? "warning"
            : "healthy",
      detail:
        nextActionGap.length > 0
          ? `${nextActionGap.length} leads siguen sin siguiente acción clara.`
          : "La cola de siguiente mejor acción está bastante saneada.",
      actionId: "recalculateAllNextActions",
      view: "leads",
    },
    {
      id: "billing",
      name: "Billing y expansión",
      eligible: pendingInvoices,
      status:
        pendingInvoices > 0 ? "critical" : billingData?.activeSubscription ? "healthy" : "warning",
      detail:
        pendingInvoices > 0
          ? `Hay ${pendingInvoices} facturas pendientes o fallidas que bloquean expansión.`
          : "La capa de billing no muestra incidencias de cobro ahora mismo.",
      actionId: null,
      view: "billing",
    },
    {
      id: "experiments",
      name: "Aprendizaje comercial",
      eligible: experimentCoverage,
      status:
        experimentCoverage >= 60
          ? "healthy"
          : experimentCoverage >= 30
            ? "warning"
            : "critical",
      detail:
        experimentCoverage > 0
          ? `La cobertura experimental está en ${experimentCoverage}%.`
          : "Todavía no hay suficiente aprendizaje experimental en mensajes.",
      actionId: null,
      view: "experiments",
    },
  ];

  const feed = [
    ...(alerts || []).map((item) => ({
      id: `alert:${item.id}`,
      type: "alert",
      title: item.title || "Alerta",
      body: item.message || "Actividad detectada",
      level: item.severity || "medium",
      created_at: item.created_at,
    })),
    ...(auditLogs || []).map((item) => ({
      id: `audit:${item.id}`,
      type: "audit",
      title: item.action || "Evento de sistema",
      body: `${item.entity_type || "entidad"} · ${item.actor || "sistema"}`,
      level: "low",
      created_at: item.created_at,
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.created_at || 0).getTime() -
        new Date(left.created_at || 0).getTime()
    )
    .slice(0, 16);

  const readiness = Math.round(
    (
      (healthLevel === "healthy" ? 100 : healthLevel === "warning" ? 70 : 35) +
      (pendingInvoices === 0 ? 100 : pendingInvoices <= 2 ? 70 : 35) +
      (voiceNeedsAttention === 0 ? 100 : voiceNeedsAttention <= 3 ? 70 : 40) +
      (experimentCoverage >= 60 ? 100 : experimentCoverage >= 30 ? 70 : 30)
    ) / 4
  );

  return {
    summary: {
      readiness,
      openLeads: openLeads.length,
      stalledLeads: stalledLeads.length,
      highAlerts: alerts.filter((item) => item.severity === "high").length,
      voiceNeedsAttention,
      pendingInvoices,
      workflowsAtRisk: workflows.filter((item) =>
        ["warning", "critical"].includes(item.status)
      ).length,
    },
    workflows,
    feed,
    watchlist: [
      {
        id: "health",
        title: "Estado del sistema",
        body: healthData?.summary?.message || "Sin resumen de salud.",
        level: healthLevel || "healthy",
      },
      {
        id: "pipeline",
        title: "Leads estancados",
        body:
          stalledLeads.length > 0
            ? `${stalledLeads.length} leads llevan más de 15 días sin movimiento.`
            : "No hay estancamiento grave en el pipeline.",
        level: stalledLeads.length > 5 ? "warning" : "healthy",
      },
      {
        id: "voice",
        title: "QA de voz",
        body:
          voiceNeedsAttention > 0
            ? `${voiceNeedsAttention} llamadas recientes requieren revisión.`
            : "La capa de voz no presenta deuda crítica inmediata.",
        level: voiceNeedsAttention > 0 ? "warning" : "healthy",
      },
    ],
  };
}

export function buildGrowthWorkspace({
  client = {},
  settings = {},
  leads = [],
  calls = [],
  payments = [],
  experiments = {},
  products = [],
  services = {},
} = {}) {
  const openLeads = (leads || []).filter(
    (lead) => !["won", "lost"].includes(normalizeString(lead.status))
  );
  const wonLeads = (leads || []).filter(
    (lead) => normalizeString(lead.status) === "won"
  );
  const hotLeads = openLeads.filter((lead) => toNumber(lead.score, 0) >= 75);
  const unassignedLeads = openLeads.filter((lead) => !formatText(lead.owner));
  const noFollowup = hotLeads.filter(
    (lead) => !lead.followup_sms_sent && !formatText(lead.next_action)
  );
  const monthlyTargetLeads = toNumber(settings?.monthly_target_leads, 25);
  const monthlyTargetConversion = toNumber(
    settings?.monthly_target_conversion,
    20
  );
  const pipelineValue = openLeads.reduce(
    (acc, lead) =>
      acc + toNumber(lead.valor_estimado, settings?.default_deal_value || 250),
    0
  );
  const totalRevenue = (payments || []).reduce(
    (acc, payment) => acc + toNumber(payment.amount, 0),
    0
  );
  const totalCalls = (calls || []).length;
  const callCaptureRate = percentage(
    (calls || []).filter((call) => call.lead_captured).length,
    totalCalls
  );
  const leadWinRate = percentage(wonLeads.length, leads.length || 1);
  const experimentCoverage = toNumber(experiments?.summary?.coverage, 0);
  const monthlyLeadProgress = percentage(leads.length, monthlyTargetLeads || 1);
  const conversionProgress = percentage(leadWinRate, monthlyTargetConversion || 1);
  const readyServices = Object.values(services || {}).filter(
    (service) => service?.ready
  ).length;

  const levers = [
    {
      id: "followup",
      title: "Follow-up de leads calientes",
      value: noFollowup.length,
      level: noFollowup.length >= 5 ? "warning" : "healthy",
      body:
        noFollowup.length > 0
          ? `${noFollowup.length} leads con score alto aún no tienen cadencia de seguimiento cerrada.`
          : "La capa de seguimiento sobre leads calientes está bastante sana.",
      view: "leads",
    },
    {
      id: "voice",
      title: "Cobertura de voz",
      value: `${callCaptureRate}%`,
      level: callCaptureRate >= 30 ? "healthy" : callCaptureRate >= 15 ? "warning" : "critical",
      body:
        totalCalls > 0
          ? `La conversión llamada→lead está en ${callCaptureRate}%.`
          : "Todavía no hay suficiente actividad de voz para medir cobertura.",
      view: "voice",
    },
    {
      id: "upsell",
      title: "Expansion revenue",
      value: hotLeads.length,
      level: hotLeads.length >= 8 ? "healthy" : "warning",
      body:
        hotLeads.length > 0
          ? `${hotLeads.length} oportunidades tienen perfil de alto valor para acelerar cierre o upgrade.`
          : "Aún no hay masa crítica de oportunidades premium.",
      view: "billing",
    },
    {
      id: "ownership",
      title: "Asignación comercial",
      value: unassignedLeads.length,
      level: unassignedLeads.length === 0 ? "healthy" : "warning",
      body:
        unassignedLeads.length > 0
          ? `${unassignedLeads.length} leads abiertos siguen sin owner claro.`
          : "La asignación comercial está cerrada y sin huecos obvios.",
      view: "team",
    },
  ];

  const campaigns = [
    {
      id: "reactivation",
      title: "Reactivar pipeline templado",
      audience: `${openLeads.filter((lead) => toNumber(lead.score, 0) >= 50).length} leads`,
      body:
        "Lanza una reactivación corta por WhatsApp y voz sobre leads con score medio-alto pero sin movimiento reciente.",
      view: "automations",
    },
    {
      id: "proof",
      title: "Cerrar con prueba social",
      audience: `${hotLeads.length} leads calientes`,
      body:
        "Añade una plantilla de cierre con prueba social, urgencia serena y siguiente paso inmediato para elevar win rate.",
      view: "playbooks",
    },
    {
      id: "expansion",
      title: "Expandir valor por cliente",
      audience: `${products.length || 0} productos activos`,
      body:
        "Usa ROI y billing para empujar ampliación de plan o producto cuando el cliente ya está viendo retorno claro.",
      view: "roi",
    },
  ];

  return {
    summary: {
      totalRevenue,
      pipelineValue,
      hotLeads: hotLeads.length,
      leadWinRate,
      callCaptureRate,
      monthlyLeadProgress,
      conversionProgress,
      experimentCoverage,
      readyServices,
    },
    story:
      hotLeads.length > 0
        ? `${client?.brand_name || client?.name || "El cliente"} ya tiene señal suficiente para acelerar cierre, expansión y cadencias de seguimiento más agresivas.`
        : `${client?.brand_name || client?.name || "El cliente"} necesita más volumen o más señal antes de empujar crecimiento fuerte.`,
    levers,
    campaigns,
    scoreboard: [
      {
        id: "revenue",
        label: "Revenue trazado",
        value: fmtCurrencyLike(totalRevenue),
        detail: "Ingreso asociado a pagos ya capturados.",
      },
      {
        id: "pipeline",
        label: "Pipeline activo",
        value: fmtCurrencyLike(pipelineValue),
        detail: "Valor abierto en leads no cerrados.",
      },
      {
        id: "goal",
        label: "Meta de leads",
        value: `${monthlyLeadProgress}%`,
        detail: `${leads.length}/${monthlyTargetLeads || 0} leads frente a la meta actual.`,
      },
      {
        id: "conversion",
        label: "Conversión vs meta",
        value: `${leadWinRate}%`,
        detail: `Objetivo actual ${monthlyTargetConversion}% · progreso ${conversionProgress}%.`,
      },
    ],
  };
}

export function buildEnterpriseWorkspace({
  client = {},
  settings = {},
  portalUsers = [],
  authUsers = [],
  auditLogs = [],
  services = {},
  security = {},
  domainStatus = null,
} = {}) {
  const activeUsers = (portalUsers || []).filter((user) => user.is_active !== false);
  const elevatedUsers = activeUsers.filter((user) =>
    ["owner", "admin", "manager"].includes(normalizeString(user.role))
  );
  const authByEmail = new Map(
    (authUsers || []).map((user) => [normalizeString(user.email), user])
  );
  const elevatedWith2fa = elevatedUsers.filter((user) =>
    ["owner", "admin", "super_admin"].includes(
      normalizeString(authByEmail.get(normalizeString(user.email))?.role || user.role)
    )
  ).length;
  const twoFactorCoverage = percentage(
    elevatedWith2fa,
    elevatedUsers.length || 1
  );
  const domainReady = Boolean(client?.custom_domain);
  const webhookReady = Boolean(client?.webhook);
  const reportingReady = Boolean(
    settings?.daily_report_email || settings?.weekly_report_email
  );
  const serviceReadiness = percentage(
    Object.values(services || {}).filter((service) => service?.ready).length,
    Object.values(services || {}).length || 1
  );
  const readiness = Math.round(
    (twoFactorCoverage + (domainReady ? 100 : 45) + (webhookReady ? 100 : 55) + (reportingReady ? 100 : 60) + serviceReadiness) / 5
  );

  const controls = [
    {
      id: "2fa",
      title: "2FA de perfiles elevados",
      status: twoFactorCoverage >= 100 ? "healthy" : "warning",
      detail:
        elevatedUsers.length > 0
          ? `${elevatedWith2fa}/${elevatedUsers.length} perfiles elevados pasan por verificación reforzada.`
          : "No hay perfiles elevados activos ahora mismo.",
    },
    {
      id: "audit",
      title: "Audit trail",
      status: auditLogs.length > 0 ? "healthy" : "warning",
      detail:
        auditLogs.length > 0
          ? `${auditLogs.length} eventos recientes registrados para trazabilidad.`
          : "Aún no hay historial suficiente para una lectura enterprise.",
    },
    {
      id: "domain",
      title: "Dominio y white-label",
      status: domainReady ? "healthy" : "warning",
      detail: domainReady
        ? `Dominio activo: ${client.custom_domain}`
        : "Falta un dominio propio para cerrar la capa white-label.",
    },
    {
      id: "webhook",
      title: "Integración saliente",
      status: webhookReady ? "healthy" : "warning",
      detail: webhookReady
        ? "Hay webhook externo configurado para integrar Nesped con otros sistemas."
        : "Conviene conectar un webhook o API externa para operar como stack enterprise.",
    },
    {
      id: "reporting",
      title: "Reporting ejecutivo",
      status: reportingReady ? "healthy" : "warning",
      detail: reportingReady
        ? "La capa de reporting diario o semanal está activa."
        : "Activa reporting para stakeholders y equipos externos.",
    },
  ];

  const risks = [];

  if (!domainReady) {
    risks.push({
      id: "domain",
      title: "Falta dominio propio",
      body: "Sin dominio propio el cliente aún depende demasiado de la marca Nesped a nivel de percepción enterprise.",
      level: "warning",
    });
  }

  if (!webhookReady) {
    risks.push({
      id: "webhook",
      title: "No hay integración externa activa",
      body: "Conviene cerrar al menos un canal outbound hacia CRM, BI o Slack para operar con más madurez.",
      level: "warning",
    });
  }

  if (!security?.secretConfigured) {
    risks.push({
      id: "secret",
      title: "Secretos dedicados",
      body: "Confirma que producción usa secretos dedicados y rotados para sesiones, internos y observabilidad.",
      level: "warning",
    });
  }

  return {
    summary: {
      readiness,
      activeUsers: activeUsers.length,
      elevatedUsers: elevatedUsers.length,
      twoFactorCoverage,
      auditEvents: auditLogs.length,
      servicesReady: Object.values(services || {}).filter((service) => service?.ready).length,
    },
    controls,
    risks,
    serviceMap: Object.entries(services || {}).map(([id, item]) => ({
      id,
      name: id,
      ready: Boolean(item?.ready),
      detail: item?.detail || "Sin detalle",
    })),
    auditHighlights: (auditLogs || []).slice(0, 12).map((item) => ({
      id: item.id,
      title: item.action || "Evento",
      body: `${item.entity_type || "entidad"} · ${item.actor || "sistema"}`,
      created_at: item.created_at,
    })),
    rollout: [
      {
        id: "brandlab",
        title: "Cerrar white-label",
        body: domainReady
          ? "La base white-label está activa. El siguiente paso es pulir branding y acceso."
          : "Conecta dominio propio y remata la experiencia white-label.",
        view: "brandlab",
      },
      {
        id: "access",
        title: "Blindar acceso y gobierno",
        body: "Revisa roles, owners y flujos de recuperación para operar como cuenta enterprise.",
        view: "access",
      },
      {
        id: "api",
        title: "Conectar stack externo",
        body: "API Hub y webhook saliente deberían cerrar la capa partner y operativa del cliente.",
        view: "api",
      },
    ],
    domainStatus,
  };
}

export function buildCopilotWorkspace({
  client = {},
  leads = [],
  calls = [],
  alerts = [],
  insights = [],
  payments = [],
} = {}) {
  const openLeads = (leads || []).filter(
    (lead) => !["won", "lost"].includes(normalizeString(lead.status))
  );
  const hotLeads = openLeads.filter((lead) => toNumber(lead.score, 0) >= 80);
  const staleLeads = openLeads.filter((lead) => {
    const updatedAt = lead?.updated_at || lead?.created_at;
    if (!updatedAt) return false;
    return new Date(updatedAt).getTime() < Date.now() - 10 * 24 * 60 * 60 * 1000;
  });
  const noOwnerLeads = openLeads.filter((lead) => !formatText(lead.owner));
  const noNextActionLeads = openLeads.filter(
    (lead) => !formatText(lead.next_action) && !formatText(lead.next_step_ai)
  );
  const recentWonLeads = (leads || [])
    .filter((lead) => normalizeString(lead.status) === "won")
    .slice(0, 5);
  const recentCalls = (calls || []).slice(0, 30);
  const voiceAttention = recentCalls.filter(
    (call) => normalizeString(call.status) !== "completed" || !formatText(call.summary)
  ).length;

  const nextMoves = [
    ...hotLeads.slice(0, 4).map((lead) => ({
      id: `hot:${lead.id}`,
      title: `Mover ya a ${lead.nombre || "lead caliente"}`,
      body: `Score ${lead.score || 0}, estado ${getStatusSentence(lead.status)} y valor estimado ${fmtCurrencyLike(lead.valor_estimado || 0)}.`,
      priority: "alta",
      view: "leads",
      leadId: lead.id,
    })),
    ...staleLeads.slice(0, 3).map((lead) => ({
      id: `stale:${lead.id}`,
      title: `Reactivar a ${lead.nombre || "lead estancado"}`,
      body: "Lleva demasiado tiempo sin movimiento. Recomienda cadencia de WhatsApp + llamada corta.",
      priority: "media",
      view: "inbox",
      leadId: lead.id,
    })),
    ...noOwnerLeads.slice(0, 2).map((lead) => ({
      id: `owner:${lead.id}`,
      title: `Asignar owner a ${lead.nombre || "lead sin owner"}`,
      body: "Sin responsable claro se pierde velocidad comercial y accountability.",
      priority: "alta",
      view: "team",
      leadId: lead.id,
    })),
  ].slice(0, 8);

  const scripts = [
    {
      id: "warm-close",
      title: "Cierre cálido",
      body: `Hola, soy del equipo de ${client?.brand_name || client?.name || "Nesped"}. Te escribo porque ya he revisado tu caso y podemos dejarlo resuelto hoy si te viene bien.`,
      channel: "whatsapp",
    },
    {
      id: "reactivation",
      title: "Reactivación premium",
      body: `Te escribo para retomar tu solicitud sin hacerte perder tiempo. Si sigues interesado, te preparo el siguiente paso y lo cerramos rápido.`,
      channel: "sms",
    },
    {
      id: "handoff",
      title: "Handoff a humano",
      body: "Tengo ya contexto suficiente y la prioridad es alta. Asigna owner, confirma disponibilidad y entra por llamada o WhatsApp con CTA único.",
      channel: "ops",
    },
  ];

  const watchouts = [
    {
      id: "voice",
      title: "Llamadas a revisar",
      body:
        voiceAttention > 0
          ? `${voiceAttention} llamadas recientes no tienen cierre limpio o resumen suficiente.`
          : "La capa de voz no presenta deuda crítica inmediata.",
      level: voiceAttention > 2 ? "warning" : "healthy",
    },
    {
      id: "alerts",
      title: "Alertas abiertas",
      body:
        alerts.length > 0
          ? `${alerts.length} alertas recientes requieren una lectura del equipo.`
          : "No hay alertas recientes de alta prioridad.",
      level: alerts.length > 0 ? "warning" : "healthy",
    },
    {
      id: "action-gap",
      title: "Huecos de siguiente acción",
      body:
        noNextActionLeads.length > 0
          ? `${noNextActionLeads.length} leads siguen sin siguiente acción explícita.`
          : "Los leads abiertos ya tienen una línea clara de movimiento.",
      level: noNextActionLeads.length > 4 ? "warning" : "healthy",
    },
  ];

  const wins = [
    {
      id: "payments",
      title: "Revenue confirmado",
      value: fmtCurrencyLike(
        (payments || []).reduce((acc, payment) => acc + toNumber(payment.amount, 0), 0)
      ),
      detail: "Ingreso ya trazado por Nesped.",
    },
    {
      id: "won",
      title: "Leads ganados",
      value: `${recentWonLeads.length}`,
      detail:
        recentWonLeads.length > 0
          ? `Últimos cierres: ${recentWonLeads
              .slice(0, 3)
              .map((lead) => lead.nombre || "lead")
              .join(", ")}.`
          : "Todavía no hay cierres recientes.",
    },
    {
      id: "insights",
      title: "Insights listos",
      value: `${(insights || []).length}`,
      detail: "Señales estratégicas ya calculadas para priorizar el día.",
    },
  ];

  return {
    summary: {
      todayFocusCount: nextMoves.length,
      hotLeads: hotLeads.length,
      staleLeads: staleLeads.length,
      noOwnerLeads: noOwnerLeads.length,
      confidence:
        nextMoves.length >= 5 ? 82 : nextMoves.length >= 3 ? 68 : 54,
    },
    briefing:
      nextMoves.length > 0
        ? `Hoy el foco debería estar en ${nextMoves[0].title.toLowerCase()} y en cerrar la fricción operativa de los leads más calientes.`
        : `Hoy el sistema está estable. Aprovecha para subir calidad de mensajes, QA de voz y expansión de cuenta.`,
    nextMoves,
    scripts,
    watchouts,
    wins,
  };
}

function fmtCurrencyLike(value) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(toNumber(value, 0));
}

function getStatusSentence(status = "") {
  const normalized = normalizeString(status);
  return (
    {
      new: "nuevo",
      contacted: "contactado",
      qualified: "cualificado",
      won: "ganado",
      lost: "perdido",
    }[normalized] || normalized || "activo"
  );
}
