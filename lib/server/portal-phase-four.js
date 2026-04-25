import { buildPortalServices } from "@/lib/server/portal-phase-three";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 1)) * 100);
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function formatText(value = "") {
  return String(value || "").trim();
}

function fmtMoney(value = 0) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(toNumber(value, 0));
}

function unique(list = []) {
  return [...new Set(list.filter(Boolean))];
}

function buildIndustryTemplates(industry = "") {
  const normalized = normalize(industry);

  if (normalized.includes("clinica")) {
    return [
      {
        id: "clinic-reactivation",
        title: "Reactivación clínica",
        trigger: "lead estancado 10 días",
        body: "WhatsApp breve, llamada empática y cierre a cita o valoración.",
      },
      {
        id: "clinic-missed-call",
        title: "Recuperación de llamada perdida",
        trigger: "llamada sin respuesta",
        body: "SMS corto + recordatorio + segundo intento en la mejor franja.",
      },
      {
        id: "clinic-payment",
        title: "Cobro y onboarding",
        trigger: "pago confirmado",
        body: "Email premium + onboarding + handoff a humano.",
      },
    ];
  }

  if (normalized.includes("inmobili")) {
    return [
      {
        id: "real-estate-visit",
        title: "Agendar visita",
        trigger: "lead caliente",
        body: "WhatsApp con prueba social + llamada + cierre a visita.",
      },
      {
        id: "real-estate-cold",
        title: "Recuperar interés",
        trigger: "lead frío",
        body: "Secuencia ligera por SMS y voz con urgencia serena.",
      },
      {
        id: "real-estate-owner",
        title: "Asignación por owner",
        trigger: "lead sin owner",
        body: "Enrutar al comercial adecuado según zona o producto.",
      },
    ];
  }

  return [
    {
      id: "premium-followup",
      title: "Follow-up premium",
      trigger: "lead sin respuesta",
      body: "Secuencia WhatsApp + SMS + llamada con CTA único.",
    },
    {
      id: "handoff-human",
      title: "Handoff humano",
      trigger: "lead con intención alta",
      body: "Asignar owner, resumir objeciones y empujar cierre.",
    },
    {
      id: "expansion-play",
      title: "Expansión de valor",
      trigger: "cliente con ROI alto",
      body: "Propuesta de upgrade o paquete superior con contexto.",
    },
  ];
}

function inferIntegrationReady(id, client = {}, settings = {}) {
  const env = process.env;

  switch (id) {
    case "google_calendar":
      return Boolean(env.GOOGLE_CLIENT_ID || env.GOOGLE_CALENDAR_CLIENT_ID);
    case "slack":
      return Boolean(env.SLACK_BOT_TOKEN || env.OPS_ALERT_WEBHOOK_URL);
    case "hubspot":
      return Boolean(env.HUBSPOT_ACCESS_TOKEN);
    case "pipedrive":
      return Boolean(env.PIPEDRIVE_API_TOKEN);
    case "zapier":
      return Boolean(client?.webhook || env.ZAPIER_WEBHOOK_URL);
    case "make":
      return Boolean(client?.webhook || env.MAKE_WEBHOOK_URL);
    case "meta_ads":
      return Boolean(env.META_ACCESS_TOKEN);
    case "google_ads":
      return Boolean(env.GOOGLE_ADS_DEVELOPER_TOKEN);
    case "sso_google":
      return Boolean(env.GOOGLE_CLIENT_ID && env.NESPED_SESSION_SECRET);
    case "sso_microsoft":
      return Boolean(env.AZURE_AD_TENANT_ID || env.MICROSOFT_CLIENT_ID);
    case "sso_okta":
      return Boolean(env.OKTA_ISSUER && env.OKTA_CLIENT_ID);
    case "scim":
      return Boolean(env.SCIM_BEARER_TOKEN);
    case "privacy":
      return Boolean(
        env.VOICE_PRIVACY_URL &&
          env.RECORDING_RETENTION_DAYS &&
          env.TRANSCRIPT_RETENTION_DAYS
      );
    case "reporting":
      return Boolean(settings?.daily_report_email || settings?.weekly_report_email);
    default:
      return false;
  }
}

export function getPermissionCatalog() {
  return [
    { id: "crm.view", label: "Ver CRM", area: "crm" },
    { id: "crm.edit", label: "Editar leads", area: "crm" },
    { id: "inbox.reply", label: "Responder inbox", area: "inbox" },
    { id: "voice.review", label: "Revisar voz", area: "voice" },
    { id: "automations.run", label: "Ejecutar automatizaciones", area: "ops" },
    { id: "billing.manage", label: "Gestionar billing", area: "billing" },
    { id: "brand.manage", label: "Gestionar marca", area: "brand" },
    { id: "api.manage", label: "Gestionar API", area: "api" },
    { id: "security.manage", label: "Gestionar seguridad", area: "security" },
    { id: "reports.view", label: "Ver reportes", area: "reporting" },
  ];
}

export function buildPermissionMatrix({ users = [], permissionRows = [] } = {}) {
  const catalog = getPermissionCatalog();
  const byUser = new Map();

  permissionRows.forEach((row) => {
    const key = String(row.user_id || "");
    if (!key) return;
    if (!byUser.has(key)) byUser.set(key, new Set());
    byUser.get(key).add(String(row.scope || ""));
  });

  return {
    catalog,
    rows: users.map((user) => {
      const scopes = [...(byUser.get(String(user.id || "")) || new Set())];
      return {
        userId: user.id,
        email: user.email || "",
        role: user.role || "viewer",
        scopes,
        grants: catalog.map((item) => ({
          ...item,
          enabled: scopes.includes(item.id),
        })),
      };
    }),
  };
}

export function buildWorkflowStudioData({
  client = {},
  settings = {},
  leads = [],
  calls = [],
  alerts = [],
  auditLogs = [],
  experiments = null,
} = {}) {
  const openLeads = (leads || []).filter(
    (lead) => !["won", "lost"].includes(normalize(lead.status))
  );
  const hotLeads = openLeads.filter((lead) => toNumber(lead.score, 0) >= 75);
  const staleLeads = openLeads.filter((lead) => {
    const stamp = lead?.updated_at || lead?.created_at;
    if (!stamp) return false;
    return new Date(stamp).getTime() < Date.now() - 10 * 24 * 60 * 60 * 1000;
  });
  const missingOwner = openLeads.filter((lead) => !formatText(lead.owner));
  const failedVoice = (calls || []).filter((call) =>
    ["failed", "busy", "no_answer"].includes(normalize(call.status || call.result))
  );
  const retryQueue = failedVoice.length + staleLeads.length;
  const experimentCoverage = toNumber(experiments?.summary?.coverage, 0);
  const templates = buildIndustryTemplates(client?.industry);

  const flows = [
    {
      id: "reactivation",
      name: "Reactivación premium",
      status: staleLeads.length >= 8 ? "critical" : staleLeads.length > 0 ? "warning" : "healthy",
      eligible: staleLeads.length,
      trigger: "Lead sin movimiento > 10 días",
      conditions: ["status abierto", "sin respuesta reciente", "score >= 45"],
      actions: ["WhatsApp", "SMS", "Llamada corta", "Crear recordatorio"],
      actionId: "runColdLeadReactivation",
      view: "inbox",
      nodes: ["trigger", "branch.score", "whatsapp", "sms", "voice", "owner"],
    },
    {
      id: "funnel",
      name: "Secuencia de cierre",
      status: hotLeads.length >= 6 ? "healthy" : hotLeads.length > 0 ? "warning" : "low",
      eligible: hotLeads.length,
      trigger: "Lead caliente",
      conditions: ["score >= 75", "sin pago", "sin cierre"],
      actions: ["Asignar owner", "Sugerencia IA", "Voice outreach", "Checkout"],
      actionId: "runAutomaticFunnel",
      view: "copilot",
      nodes: ["trigger", "owner", "copilot", "voice", "checkout"],
    },
    {
      id: "ownership",
      name: "Routing por owner",
      status: missingOwner.length === 0 ? "healthy" : "warning",
      eligible: missingOwner.length,
      trigger: "Lead sin owner",
      conditions: ["sin owner", "abierto"],
      actions: ["Asignar responsable", "Crear nota", "Alertar manager"],
      actionId: null,
      view: "access",
      nodes: ["trigger", "owner", "audit", "notify"],
    },
    {
      id: "voice_recovery",
      name: "Recuperación de voz",
      status: failedVoice.length >= 5 ? "warning" : failedVoice.length > 0 ? "healthy" : "low",
      eligible: failedVoice.length,
      trigger: "Llamada fallida",
      conditions: ["failed | busy | no_answer"],
      actions: ["SMS fallback", "WhatsApp", "Retry inteligente"],
      actionId: "runVoiceCalls",
      view: "voice",
      nodes: ["trigger", "sms", "whatsapp", "retry"],
    },
    {
      id: "experiments",
      name: "Auto-optimizer de playbooks",
      status: experimentCoverage >= 50 ? "healthy" : experimentCoverage >= 20 ? "warning" : "critical",
      eligible: experimentCoverage,
      trigger: "Nueva señal de replies/conversiones",
      conditions: ["variantes activas", "reply/conversion tracked"],
      actions: ["Rankear variante", "Actualizar recomendación", "Sugerir nuevo test"],
      actionId: null,
      view: "experiments",
      nodes: ["trigger", "rank", "learn", "suggest"],
    },
  ];

  const logs = (auditLogs || [])
    .filter((item) =>
      [
        "sms_sent",
        "execute_next_action",
        "lead_updated",
        "user_updated",
        "password_reset",
      ].includes(normalize(item.action))
    )
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      action: item.action,
      actor: item.actor || "sistema",
      entity_type: item.entity_type || "workflow",
      created_at: item.created_at,
    }));

  const simulations = [
    {
      id: "close-hot",
      title: "Simular cierre de lead caliente",
      outcome:
        hotLeads.length > 0
          ? `Hay ${hotLeads.length} leads donde conviene probar una secuencia de cierre con CTA único.`
          : "Ahora mismo faltan leads calientes para esta simulación.",
    },
    {
      id: "recover-voice",
      title: "Simular fallback tras llamada fallida",
      outcome:
        failedVoice.length > 0
          ? `Puedes encadenar ${failedVoice.length} llamadas fallidas hacia SMS/WhatsApp con retry.`
          : "No hay deuda fuerte de llamadas fallidas.",
    },
    {
      id: "owner-gap",
      title: "Simular routing por owner",
      outcome:
        missingOwner.length > 0
          ? `${missingOwner.length} leads ganarían velocidad si entran por routing automático.`
          : "La cobertura de owner está bastante sana.",
    },
  ];

  return {
    summary: {
      totalFlows: flows.length,
      atRisk: flows.filter((item) => ["warning", "critical"].includes(item.status)).length,
      retryQueue,
      liveTemplates: templates.length,
      experimentCoverage,
    },
    templates,
    flows,
    logs,
    simulations,
    reportBuilder: [
      {
        id: "daily-exec",
        title: "Daily exec brief",
        body: "Resumen corto de riesgo, pipeline, QA de voz e ingresos del día.",
      },
      {
        id: "weekly-revenue",
        title: "Revenue weekly",
        body: "Ingresos, fugas, upgrades y presión de uso por cliente.",
      },
      {
        id: "team-coach",
        title: "Coaching del equipo",
        body: "QA, objeciones repetidas y ranking por owner/agente.",
      },
    ],
  };
}

export function buildIntegrationsCenterData({
  client = {},
  settings = {},
} = {}) {
  const services = buildPortalServices(client, settings);

  const connectors = [
    {
      id: "google_calendar",
      name: "Google Calendar",
      category: "agenda",
      ready: inferIntegrationReady("google_calendar", client, settings),
      detail: "Reserva, reprogramación y recordatorios automáticos.",
    },
    {
      id: "slack",
      name: "Slack",
      category: "ops",
      ready: inferIntegrationReady("slack", client, settings),
      detail: "Alertas operativas, pagos y leads calientes.",
    },
    {
      id: "hubspot",
      name: "HubSpot",
      category: "crm",
      ready: inferIntegrationReady("hubspot", client, settings),
      detail: "Sincronización de leads, owners y lifecycle.",
    },
    {
      id: "pipedrive",
      name: "Pipedrive",
      category: "crm",
      ready: inferIntegrationReady("pipedrive", client, settings),
      detail: "Pipeline y actividad comercial bidireccional.",
    },
    {
      id: "zapier",
      name: "Zapier",
      category: "automation",
      ready: inferIntegrationReady("zapier", client, settings),
      detail: "Conectar Nesped con el stack del cliente sin código.",
    },
    {
      id: "make",
      name: "Make",
      category: "automation",
      ready: inferIntegrationReady("make", client, settings),
      detail: "Escenarios low-code y automatizaciones externas.",
    },
    {
      id: "meta_ads",
      name: "Meta Ads",
      category: "ads",
      ready: inferIntegrationReady("meta_ads", client, settings),
      detail: "Atribución y optimización de captación.",
    },
    {
      id: "google_ads",
      name: "Google Ads",
      category: "ads",
      ready: inferIntegrationReady("google_ads", client, settings),
      detail: "Visibilidad del coste y calidad por fuente.",
    },
  ];

  const identity = [
    {
      id: "sso_google",
      name: "SSO Google Workspace",
      ready: inferIntegrationReady("sso_google", client, settings),
      detail: "Login corporativo para clientes y equipos.",
    },
    {
      id: "sso_microsoft",
      name: "SSO Microsoft",
      ready: inferIntegrationReady("sso_microsoft", client, settings),
      detail: "Azure AD / Microsoft Entra para cuentas enterprise.",
    },
    {
      id: "sso_okta",
      name: "SSO Okta",
      ready: inferIntegrationReady("sso_okta", client, settings),
      detail: "Preparado para organizaciones con gobierno centralizado.",
    },
    {
      id: "scim",
      name: "SCIM",
      ready: inferIntegrationReady("scim", client, settings),
      detail: "Provisioning y deprovisioning de usuarios.",
    },
  ];

  const privacy = [
    {
      id: "privacy",
      title: "Política y retención",
      ready: inferIntegrationReady("privacy", client, settings),
      body: "Retención de grabaciones, transcripciones y contacto legal configurados.",
    },
    {
      id: "reporting",
      title: "Reporting ejecutivo",
      ready: inferIntegrationReady("reporting", client, settings),
      body: "Envía reportes diarios o semanales a stakeholders.",
    },
    {
      id: "domain",
      title: "White-label activo",
      ready: Boolean(client?.custom_domain),
      body: client?.custom_domain
        ? `Dominio propio conectado: ${client.custom_domain}`
        : "Falta conectar dominio propio para cerrar la capa premium.",
    },
  ];

  return {
    summary: {
      connectors: connectors.length,
      configured: connectors.filter((item) => item.ready).length,
      identityReady: identity.filter((item) => item.ready).length,
      privacyReady: privacy.filter((item) => item.ready).length,
    },
    connectors,
    identity,
    privacy,
    recipes: [
      {
        id: "revenue-loop",
        title: "Revenue loop",
        body: "Conecta ads, CRM y Nesped para ver captación, seguimiento y cierre en una sola lectura.",
      },
      {
        id: "ops-alerting",
        title: "Ops alerting",
        body: "Manda a Slack facturas fallidas, leads críticos, fallos de voice y errores de workflows.",
      },
      {
        id: "partner-stack",
        title: "Partner stack",
        body: "Zapier/Make + webhook saliente cierran la capa partner sin bloquear el producto en integraciones custom.",
      },
    ],
    enterprise: [
      {
        id: "sso",
        title: "SSO / SCIM",
        body: "La cuenta enterprise necesita federación y provisioning para escalar con menos fricción de IT.",
      },
      {
        id: "residency",
        title: "Data residency",
        body: process.env.DATA_RESIDENCY_REGION
          ? `Región declarada: ${process.env.DATA_RESIDENCY_REGION}`
          : "Define región y política para vender mejor a cuentas grandes.",
      },
    ],
    services,
  };
}

export function buildRevenueOsData({
  client = {},
  settings = {},
  leads = [],
  payments = [],
  products = [],
  users = [],
  subscriptions = [],
  invoices = [],
  experiments = null,
} = {}) {
  const totalRevenue = (payments || []).reduce(
    (acc, item) => acc + toNumber(item.amount, 0),
    0
  );
  const paidCount = (payments || []).filter((item) => normalize(item.status) === "paid").length;
  const activeUsers = (users || []).filter((user) => user.is_active !== false);
  const openLeads = (leads || []).filter(
    (lead) => !["won", "lost"].includes(normalize(lead.status))
  );
  const hotOpenLeads = openLeads.filter((lead) => toNumber(lead.score, 0) >= 75);
  const noOwner = openLeads.filter((lead) => !formatText(lead.owner));
  const stale = openLeads.filter((lead) => {
    const stamp = lead?.updated_at || lead?.created_at;
    if (!stamp) return false;
    return new Date(stamp).getTime() < Date.now() - 12 * 24 * 60 * 60 * 1000;
  });
  const defaultDealValue = toNumber(settings?.default_deal_value, 250);
  const leakedRevenue =
    stale.length * defaultDealValue + noOwner.length * defaultDealValue * 0.6;
  const activeSubscription = (subscriptions || []).find((item) =>
    ["active", "trialing"].includes(normalize(item.status))
  );
  const pendingInvoices = (invoices || []).filter((item) =>
    ["open", "past_due", "uncollectible"].includes(normalize(item.status))
  );
  const experimentReplyRate = toNumber(experiments?.summary?.replyRate, 0);
  const usageUnits = {
    calls: openLeads.length + hotOpenLeads.length,
    seats: activeUsers.length,
    workflows: 5,
    automations: openLeads.length > 0 ? 4 : 1,
  };

  return {
    summary: {
      totalRevenue,
      leakedRevenue: Math.round(leakedRevenue),
      activeSeats: activeUsers.length,
      hotOpenLeads: hotOpenLeads.length,
      pendingInvoices: pendingInvoices.length,
      trialReady: !activeSubscription && openLeads.length > 0,
    },
    leakageMap: [
      {
        id: "stale",
        title: "Pipeline estancado",
        value: stale.length,
        body: stale.length
          ? `${stale.length} leads abiertos llevan demasiado tiempo sin moverse.`
          : "No hay atasco grave en el pipeline.",
      },
      {
        id: "owner",
        title: "Leads sin owner",
        value: noOwner.length,
        body: noOwner.length
          ? `${noOwner.length} leads pueden perderse por falta de accountability.`
          : "La cobertura de owner está sana.",
      },
      {
        id: "billing",
        title: "Cobro pendiente",
        value: pendingInvoices.length,
        body: pendingInvoices.length
          ? `${pendingInvoices.length} facturas abiertas están frenando expansión.`
          : "La capa de cobro no muestra fricción grave.",
      },
      {
        id: "experiments",
        title: "Reply rate",
        value: `${experimentReplyRate}%`,
        body:
          experimentReplyRate > 0
            ? `La respuesta medida está en ${experimentReplyRate}%.`
            : "Falta más aprendizaje real en mensajes.",
      },
    ],
    usageBilling: [
      { id: "calls", label: "Llamadas", value: usageUnits.calls, detail: "Unidad de uso operativo." },
      { id: "seats", label: "Seats", value: usageUnits.seats, detail: "Usuarios activos del cliente." },
      { id: "workflows", label: "Workflows", value: usageUnits.workflows, detail: "Superficie de automatización viva." },
      { id: "automations", label: "Automatizaciones", value: usageUnits.automations, detail: "Procesos con impacto directo." },
    ],
    upgradeSignals: [
      {
        id: "roi",
        title: "Upsell inteligente",
        body:
          totalRevenue > 0
            ? `Con ${fmtMoney(totalRevenue)} ya trazados, tiene sentido empujar plan superior o add-ons.`
            : "Primero toca cerrar retorno visible antes de abrir upgrade.",
      },
      {
        id: "trial",
        title: "Trials autogestionados",
        body:
          !activeSubscription
            ? "La cuenta está lista para trial, activación automática y setup guiado."
            : "Ya existe suscripción activa; el foco pasa a expansión y retención.",
      },
      {
        id: "marketplace",
        title: "Marketplace de playbooks",
        body: `Con ${products.length || 0} productos y vertical ${client?.industry || "general"}, puedes vender packs o playbooks por sector.`,
      },
    ],
    benchmark: {
      label: client?.industry || "Sector general",
      percentile:
        hotOpenLeads.length >= 8 ? 82 : hotOpenLeads.length >= 4 ? 64 : 48,
      story:
        hotOpenLeads.length >= 8
          ? "La cuenta ya está por encima de la media en intensidad comercial y señal de cierre."
          : "Todavía hay margen claro para subir captación, follow-up o cierre frente al benchmark esperado.",
    },
    partnerProgram: [
      {
        id: "white-label",
        title: "White-label total",
        body: client?.custom_domain
          ? "La capa white-label ya está encaminada para agencias o clientes enterprise."
          : "Con dominio y branding cerrados, esta cuenta ya sería revendible como white-label.",
      },
      {
        id: "agencies",
        title: "Programa partner",
        body: "Prepara subcuentas, reporting por cliente y paquetes de servicio para agencias.",
      },
    ],
  };
}

export function buildConversationAssistPayload({
  client = {},
  lead = {},
  memory = null,
  playbook = {},
  channel = "whatsapp",
  goal = "followup",
} = {}) {
  const brandName = client?.brand_name || client?.name || "Nesped";
  const name = lead?.nombre || "hola";
  const temperature = normalize(memory?.temperature) || "templado";
  const objection = formatText(memory?.last_objection);
  const recommendedProduct = formatText(memory?.recommended_product);
  const opener =
    normalize(channel) === "email"
      ? `Seguimos con tu solicitud en ${brandName}`
      : `Hola ${name}, soy del equipo de ${brandName}.`;

  const angle =
    goal === "close"
      ? "Podemos dejar hoy mismo el siguiente paso cerrado si te viene bien."
      : goal === "reactivate"
        ? "Te escribo para retomarlo sin hacerte perder tiempo."
        : "Te escribo para avanzar con tu solicitud de forma muy simple.";

  const objectionLine = objection
    ? ` La última fricción detectada fue "${objection}". La resolvemos de forma muy directa.`
    : "";
  const productLine = recommendedProduct
    ? ` Por lo que has contado, la mejor opción ahora mismo es ${recommendedProduct}.`
    : "";
  const temperatureLine =
    temperature === "caliente"
      ? " Tiene mucho sentido cerrar una llamada o un siguiente paso ahora."
      : temperature === "frio"
        ? " Si ya no encaja, no pasa nada; si sí, te lo dejo muy fácil."
        : " Si te encaja, lo dejamos encaminado ya.";

  const body = `${opener} ${angle}${objectionLine}${productLine}${temperatureLine}`.replace(/\s+/g, " ").trim();
  const coach = [
    playbook?.tone ? `Tono: ${playbook.tone}` : null,
    playbook?.closing ? `Cierre: ${playbook.closing}` : null,
    playbook?.objections ? `Objeciones: ${playbook.objections}` : null,
  ].filter(Boolean);

  return {
    channel,
    subject:
      normalize(channel) === "email"
        ? `${brandName} · siguiente paso`
        : "",
    primary: body,
    alternatives: [
      `${opener} Si quieres, te resumo en 1 minuto el siguiente paso y lo cerramos.`,
      `${opener} Ya tengo claro cómo ayudarte; dime si prefieres WhatsApp, llamada o que te lo deje por escrito.`,
      `${opener} ${goal === "close" ? "Estamos en punto de cierre." : "Tengo preparado el siguiente paso."} Si te va bien, lo movemos hoy.`,
    ],
    quickReplies: unique([
      "Sí, llámame",
      "Pásamelo por WhatsApp",
      "Envíame el enlace",
      "Lo veo luego",
    ]),
    coach,
  };
}
