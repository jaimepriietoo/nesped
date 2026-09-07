/* =========================================================================
   Datos de muestra para la demo del portal.

   Inventados a propósito y con esa forma exacta: son los mismos campos que
   devuelven /api/portal/overview, /inbox, /voice-center y /health, así que
   lo que se ve aquí es lo que se verá con datos reales.
   ========================================================================= */

const NOMBRES = [
  "Marta Rubio", "Clínica Dental Sur", "Javier Ordóñez", "Instalaciones Vega",
  "Ana Belén Cruz", "Reformas Álvarez", "Lucía Herrero", "Talleres Peña",
  "Carlos Nieto", "Centro Médico Pilar", "Sonia Márquez", "Climatiza Duero",
  "Pablo Ferrer", "Óptica Mirador", "Elena Cabrera", "Fontanería Mateo",
  "Diego Salas", "Estética Nova", "Irene Ballesteros", "Electro Campos",
  "Raúl Company", "Fisio Arroyo", "Nuria Sanz", "Cristalería Bermejo",
];

const INTERESES = [
  "Presupuesto de aerotermia para chalet",
  "Primera consulta de ortodoncia invisible",
  "Revisión de caldera antes del invierno",
  "Cambio de ventanas, tres huecos",
  "Limpieza dental y revisión anual",
  "Instalación de placas solares 4 kW",
  "Urgencia: fuga en el baño",
  "Presupuesto de reforma de cocina",
];

const ACCIONES = [
  "Llamar mañana antes de las 11:00, pidió confirmación de precio",
  "Enviar presupuesto por email, lo espera hoy",
  "Cerrar cita para el jueves por la tarde",
  "Confirmar disponibilidad de material y avisar",
  "Segundo intento: no cogió a la primera",
];

const CIUDADES = ["Valladolid", "Palencia", "Zamora", "Salamanca", "Burgos", "León"];
const DUENOS = ["Jaime", "Laura", "Sergio", ""];
const ESTADOS = ["new", "new", "contacted", "contacted", "qualified", "won", "lost"];

/** Generador determinista: la demo se ve igual en cada recarga. */
function aleatorio(semilla) {
  let x = semilla;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

const r = aleatorio(20260907);

function hace(dias, horas = 0) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(d.getHours() - horas);
  return d.toISOString();
}

function elige(lista) {
  return lista[Math.floor(r() * lista.length)];
}

const LEADS = Array.from({ length: 24 }, (_, i) => {
  const estado = ESTADOS[Math.floor(r() * ESTADOS.length)];
  const score = 30 + Math.floor(r() * 70);
  return {
    id: `lead-${i}`,
    nombre: NOMBRES[i % NOMBRES.length],
    telefono: `+3498${String(3000000 + Math.floor(r() * 999999)).slice(0, 7)}`,
    email: `contacto${i}@ejemplo.es`,
    ciudad: elige(CIUDADES),
    status: estado,
    score,
    interes: elige(INTERESES),
    necesidad: elige(INTERESES),
    next_action: elige(ACCIONES),
    next_action_priority: score > 75 ? "alta" : score > 50 ? "media" : "baja",
    valor_estimado: 400 + Math.floor(r() * 5200),
    predicted_close_probability: Math.floor(r() * 100),
    owner: elige(DUENOS),
    created_at: hace(Math.floor(r() * 26), Math.floor(r() * 24)),
    updated_at: hace(Math.floor(r() * 6), Math.floor(r() * 24)),
  };
});

const RESUMENES = [
  "Pide presupuesto de aerotermia. Chalet de 180 m², ya tiene suelo radiante. Quiere respuesta esta semana.",
  "Primera consulta. Pregunta por ortodoncia invisible y por financiación a 12 meses.",
  "Fuga en el baño, urgente. Puede estar en casa toda la tarde.",
  "Compara tres presupuestos. El precio le encaja, le preocupa el plazo de instalación.",
  "Llama fuera de horario. Quiere cita para revisión, le da igual el día.",
  "Ya es cliente. Llama para ampliar la instalación con dos radiadores más.",
];

const LLAMADAS = Array.from({ length: 40 }, (_, i) => {
  const capturado = r() > 0.38;
  const dur = 45 + Math.floor(r() * 260);
  return {
    id: `call-${i}`,
    from_number: `+3498${String(3000000 + Math.floor(r() * 999999)).slice(0, 7)}`,
    to_number: "+34983460825",
    status: "completed",
    duration_seconds: dur,
    lead_captured: capturado,
    summary: elige(RESUMENES),
    transcript:
      "Agente: Buenas tardes, gracias por llamar. ¿En qué puedo ayudarle?\n" +
      "Cliente: Hola, buenas. Llamaba para pedir un presupuesto.\n" +
      "Agente: Por supuesto. ¿Me puede decir de qué se trata exactamente?\n" +
      "Cliente: Sí, mire, es para la instalación de…\n" +
      "Agente: Perfecto, lo anoto. ¿Me confirma un teléfono de contacto?\n" +
      "Cliente: Sí, es este mismo desde el que llamo.\n" +
      "Agente: Genial. Le paso el presupuesto hoy mismo y le llamamos mañana.",
    recording_url: "",
    created_at: hace(Math.floor(r() * 14), Math.floor(r() * 24)),
    qa: { overall: 45 + Math.floor(r() * 55) },
    compliance: { score: 70 + Math.floor(r() * 30) },
  };
});

const ganados = LEADS.filter((l) => l.status === "won").length;
const perdidos = LEADS.filter((l) => l.status === "lost").length;
const contactados = LEADS.filter((l) => l.status === "contacted").length;
const cualificados = LEADS.filter((l) => l.status === "qualified").length;
const nuevos = LEADS.filter((l) => l.status === "new").length;

window.DEMO = {
  overview: {
    success: true,
    currentUser: { email: "jaime@ejemplo.es", role: "client" },
    currentRole: "client",
    client: {
      id: "demo",
      name: "Nesped Demo",
      brand_name: "Nesped Demo",
      industry: "Instalaciones y clínicas",
      owner_email: "jaime@ejemplo.es",
      twilio_number: "+34 983 460 825",
      original_number: "+34 983 112 233",
      custom_domain: "",
      is_active: true,
    },
    settings: {
      realtime_refresh_seconds: 15,
      default_deal_value: 1200,
      monthly_target_leads: 25,
      monthly_target_conversion: 20,
    },
    users: [
      { id: "u1", name: "Jaime Prieto", email: "jaime@ejemplo.es", role: "owner", is_active: true, created_at: hace(120) },
      { id: "u2", name: "Laura Sáez", email: "laura@ejemplo.es", role: "admin", is_active: true, created_at: hace(84) },
      { id: "u3", name: "Sergio Blanco", email: "sergio@ejemplo.es", role: "member", is_active: true, created_at: hace(31) },
      { id: "u4", name: "Marina Ortiz", email: "marina@ejemplo.es", role: "member", is_active: false, created_at: hace(12) },
    ],
    leads: LEADS,
    calls: LLAMADAS,
    alerts: [
      { id: "a1", severity: "high", message: "3 leads con puntuación alta llevan más de 48 h sin contactar.", created_at: hace(0, 3) },
      { id: "a2", severity: "medium", message: "El 27 % de las llamadas de esta semana entró fuera de horario.", created_at: hace(1) },
      { id: "a3", severity: "low", message: "Cuatro leads siguen sin responsable asignado.", created_at: hace(2) },
    ],
    insights: [
      { id: "i1", type: "conversión", title: "Los martes por la mañana convierten un 41 % más", description: "Es la franja con mejor ratio de las cuatro últimas semanas. Concentra ahí las devoluciones de llamada." },
      { id: "i2", type: "pipeline", title: "El ticket medio ha subido a 2.140 €", description: "Empujado por los presupuestos de aerotermia, que pesan ya un tercio del pipeline abierto." },
      { id: "i3", type: "riesgo", title: "Una de cada cuatro llamadas se corta antes de 40 segundos", description: "Casi todas entran entre las 14:00 y las 16:00. Merece la pena revisar el saludo de esa franja." },
      { id: "i4", type: "operación", title: "Los leads sin responsable tardan 3,2 días más en cerrarse", description: "Asignar en el momento de la captura es la palanca más barata que tienes ahora." },
    ],
    benchmarks: [],
    auditLogs: [
      { id: "al1", created_at: hace(0, 2), actor_email: "jaime@ejemplo.es", action: "lead.status_changed", details: "Marta Rubio · contacted → qualified" },
      { id: "al2", created_at: hace(0, 6), actor_email: "laura@ejemplo.es", action: "lead.assigned", details: "Instalaciones Vega → Sergio" },
      { id: "al3", created_at: hace(1), actor_email: "sistema", action: "call.transcribed", details: "40 llamadas procesadas" },
      { id: "al4", created_at: hace(2), actor_email: "jaime@ejemplo.es", action: "user.invited", details: "marina@ejemplo.es · member" },
    ],
    smsTemplates: [],
    whatsappTemplates: [],
    quickActions: [],
    metrics: {
      totalCalls: LLAMADAS.length,
      totalLeads: LEADS.length,
      conversionRate: Math.round((ganados / LEADS.length) * 100),
      avgDuration: Math.round(LLAMADAS.reduce((a, c) => a + c.duration_seconds, 0) / LLAMADAS.length),
      avgLeadScore: Math.round(LEADS.reduce((a, l) => a + l.score, 0) / LEADS.length),
      hotLeads: LEADS.filter((l) => l.score > 75).length,
      totalPotentialRevenue: LEADS.filter((l) => l.status !== "lost").reduce((a, l) => a + l.valor_estimado, 0),
      contactedLeads: contactados,
      qualifiedLeads: cualificados,
      wonLeads: ganados,
      lostLeads: perdidos,
      unassignedLeads: LEADS.filter((l) => !l.owner).length,
      smsSentCount: 38,
    },
    rankings: {
      bestDays: [
        { label: "Martes", count: 14 }, { label: "Miércoles", count: 11 },
        { label: "Jueves", count: 9 }, { label: "Lunes", count: 7 }, { label: "Viernes", count: 5 },
      ],
      bestHours: [
        { label: "10:00 – 11:00", count: 12 }, { label: "09:00 – 10:00", count: 10 },
        { label: "17:00 – 18:00", count: 8 }, { label: "12:00 – 13:00", count: 6 }, { label: "20:00 – 21:00", count: 4 },
      ],
    },
    pipeline: { new: nuevos, contacted: contactados, qualified: cualificados, won: ganados, lost: perdidos },
  },

  "/api/portal/inbox": {
    summary: { totalThreads: 12, requiresAttention: 4, waitingForReply: 3, withCalls: 12, withRecordings: 8, withPayments: 2 },
    threads: LEADS.slice(0, 12).map((l, i) => ({
      id: l.id,
      leadId: l.id,
      leadName: l.nombre,
      email: l.email,
      phone: l.telefono,
      owner: l.owner,
      status: l.status,
      score: l.score,
      interes: l.interes,
      next_action: l.next_action,
      next_action_priority: l.next_action_priority,
      valor_estimado: l.valor_estimado,
      lastActivityAt: l.updated_at,
      lastPreview: elige(RESUMENES),
      requiresAttention: i < 4,
      callCount: 1 + Math.floor(r() * 4),
      messageCount: Math.floor(r() * 6),
      items: [
        { id: `${l.id}-1`, channel: "llamada", created_at: l.updated_at, preview: elige(RESUMENES) },
        { id: `${l.id}-2`, channel: "sms", created_at: hace(1), preview: "Le hemos enviado el presupuesto por email. Cualquier duda, responda aquí." },
        { id: `${l.id}-3`, channel: "nota", created_at: hace(2), preview: "Pidió expresamente que no le llamen antes de las 10:00." },
      ],
    })),
  },

  "/api/portal/voice-center": {
    compliance: { recordingRetentionDays: 30, transcriptRetentionDays: 90, announcementRequired: true },
    summary: {
      total: LLAMADAS.length,
      withRecording: 31,
      avgScore: Math.round(LLAMADAS.reduce((a, c) => a + c.qa.overall, 0) / LLAMADAS.length),
      avgDuration: Math.round(LLAMADAS.reduce((a, c) => a + c.duration_seconds, 0) / LLAMADAS.length),
      capturedLeads: LLAMADAS.filter((c) => c.lead_captured).length,
      avgCompliance: Math.round(LLAMADAS.reduce((a, c) => a + c.compliance.score, 0) / LLAMADAS.length),
    },
    commonIssues: [
      { label: "No confirmó el teléfono de contacto", count: 9 },
      { label: "Saludo demasiado largo", count: 7 },
      { label: "No ofreció cita concreta", count: 5 },
      { label: "Se solapó con el interlocutor", count: 3 },
      { label: "No recogió el código postal", count: 2 },
    ],
    commonObjections: [
      { label: "Me lo tengo que pensar", count: 11 },
      { label: "Es más caro de lo que esperaba", count: 8 },
      { label: "Estoy pidiendo otros presupuestos", count: 6 },
      { label: "Ahora no me viene bien", count: 4 },
      { label: "Prefiero hablar con una persona", count: 3 },
    ],
    ranking: [
      { owner: "Jaime", calls: 18, avgScore: 84, avgCompliance: 91, wins: 5 },
      { owner: "Laura", calls: 14, avgScore: 79, avgCompliance: 88, wins: 3 },
      { owner: "Sergio", calls: 8, avgScore: 71, avgCompliance: 85, wins: 1 },
    ],
  },

  "/api/portal/voice-qa": {
    summary: {
      total: LLAMADAS.length,
      avgScore: Math.round(LLAMADAS.reduce((a, c) => a + c.qa.overall, 0) / LLAMADAS.length),
      bestCalls: LLAMADAS.filter((c) => c.qa.overall >= 75).length,
      needsAttention: LLAMADAS.filter((c) => c.qa.overall < 55).length,
    },
    calls: LLAMADAS,
  },

  "/api/portal/health": {
    summary: { level: "warning", message: "La base está bien, pero hay piezas que conviene completar o vigilar.", highAlerts: 1 },
    services: {
      supabase: { level: "healthy", message: "Base de datos activa y respondiendo." },
      telnyx: { level: "warning", message: "Falta TELNYX_ACCOUNT_SID: las llamadas salientes no funcionan." },
      elevenlabs: { level: "healthy", message: "Agente de voz configurado y verificado." },
      stripe: { level: "healthy", message: "Suscripciones y webhooks operativos." },
      resend: { level: "healthy", message: "Envío de correo verificado." },
      sentry: { level: "healthy", message: "Recibiendo eventos con normalidad." },
    },
    freshness: {
      leads: { level: "healthy", message: "Último lead hace 3 horas." },
      calls: { level: "healthy", message: "Última llamada hace 1 hora." },
    },
    env: {
      summary: "5 de 6 integraciones completas",
      features: [
        { id: "voz", label: "Voz entrante", status: "ready", requiredMissing: 0, recommendedMissing: 0 },
        { id: "saliente", label: "Llamada saliente", status: "warning", requiredMissing: 1, recommendedMissing: 0 },
        { id: "sms", label: "SMS y WhatsApp", status: "ready", requiredMissing: 0, recommendedMissing: 1 },
        { id: "pagos", label: "Pagos", status: "ready", requiredMissing: 0, recommendedMissing: 0 },
        { id: "correo", label: "Correo transaccional", status: "ready", requiredMissing: 0, recommendedMissing: 0 },
        { id: "obs", label: "Observabilidad", status: "ready", requiredMissing: 0, recommendedMissing: 2 },
      ],
    },
  },

  "/api/portal/copilot": {
    summary: { pendingToday: 6, hotLeads: 5, atRisk: 3, suggestedCalls: 4 },
    briefing: "Hoy tienes seis cosas que mover. Tres son leads calientes que llevan más de dos días parados: si los llamas antes de comer, todavía están a tiempo. El resto son seguimientos que se pueden mandar por escrito.",
    nextMoves: [
      { id: "n1", title: "Llamar a Marta Rubio", body: "Puntuación 91, presupuesto de aerotermia, lleva 51 h esperando. Es la de mayor valor abierto.", value: 4800 },
      { id: "n2", title: "Enviar presupuesto a Instalaciones Vega", body: "Lo pidió por escrito y todavía no ha salido.", value: 3200 },
      { id: "n3", title: "Cerrar cita con Clínica Dental Sur", body: "Dijo que sí de palabra, falta poner día.", value: 1500 },
      { id: "n4", title: "Reasignar cuatro leads sin dueño", body: "Sin responsable tardan 3,2 días más en cerrarse." },
    ],
    scripts: [
      { id: "s1", title: "Reactivar un lead frío", body: "«Le llamaba por el presupuesto que pidió la semana pasada. ¿Sigue interesado o lo dejamos aparcado?» — directa, da salida y no suena a insistencia." },
      { id: "s2", title: "Objeción de precio", body: "«Entiendo que le parezca alto. ¿Con qué lo está comparando?» — primero entender contra qué compite, después justificar." },
    ],
    watchouts: [
      { id: "w1", title: "Franja de 14:00 a 16:00", body: "Una de cada cuatro llamadas se corta antes de 40 segundos.", level: "warning" },
      { id: "w2", title: "Llamada saliente caída", body: "Falta la credencial de Telnyx en Railway.", level: "critical" },
    ],
    wins: [
      { id: "v1", title: "Ticket medio +18 %", body: "Cuatro semanas seguidas subiendo." },
      { id: "v2", title: "Cero llamadas perdidas", body: "Desde que la voz contesta fuera de horario." },
    ],
  },

  "/api/portal/strategy": {
    summaryCards: [
      { id: "revenue", label: "Revenue trazado", value: 18400, suffix: "EUR", detail: "Ingresos ya atribuidos a la cuenta." },
      { id: "signals", label: "Insights prioritarios", value: 4, detail: "Lecturas accionables a partir de señal real." },
      { id: "benchmarks", label: "Benchmarks activos", value: 6, detail: "KPIs que marcan dirección y fricción." },
      { id: "focus", label: "Foco de trimestre", value: 2, detail: "Palancas donde concentrar el esfuerzo." },
    ],
    insights: [
      { id: "e1", title: "El cuello de botella ya no es captar, es responder", body: "Entra volumen suficiente; se pierde en el tiempo de respuesta." },
      { id: "e2", title: "Aerotermia es el producto que tira", body: "Un tercio del pipeline y el ticket más alto." },
    ],
    productFocus: [
      { id: "p1", title: "Aerotermia", value: 6400, body: "8 oportunidades abiertas" },
      { id: "p2", title: "Placas solares", value: 3900, body: "6 oportunidades abiertas" },
      { id: "p3", title: "Ortodoncia", value: 2800, body: "5 oportunidades abiertas" },
    ],
    ownerFocus: [
      { id: "o1", title: "Jaime", value: 9200, body: "5 cierres" },
      { id: "o2", title: "Laura", value: 6100, body: "3 cierres" },
      { id: "o3", title: "Sergio", value: 3100, body: "1 cierre" },
    ],
    story: "La cuenta tiene volumen y señal suficientes. El margen está en responder antes, no en llamar más.",
  },

  "/api/portal/growth": {
    summary: { totalRevenue: 18400, pipelineValue: 41200, hotLeads: 5, leadWinRate: 21, callCaptureRate: 62, monthlyLeadProgress: 96, conversionProgress: 105, experimentCoverage: 40 },
    story: "Nesped Demo ya tiene señal suficiente para acelerar cierre, expansión y cadencias de seguimiento más agresivas.",
    levers: [
      { id: "l1", title: "Respuesta en menos de 5 minutos", body: "El mayor salto disponible: los leads contactados en la primera hora cierran el triple.", value: 3 },
      { id: "l2", title: "Segundo intento automático", body: "Un 38 % de los que no cogen sí responden al segundo intento el mismo día." },
      { id: "l3", title: "Recuperar el «me lo pienso»", body: "Once leads en esa objeción sin ninguna acción posterior." },
    ],
    campaigns: [
      { id: "c1", title: "Reactivación de fríos", body: "24 leads sin movimiento en 14 días.", status: "ready" },
      { id: "c2", title: "Fuera de horario", body: "Devolución automática a las 09:05 del día siguiente.", status: "active" },
    ],
    scoreboard: [
      { id: "sb1", label: "Revenue trazado", value: 18400, suffix: "EUR" },
      { id: "sb2", label: "Pipeline abierto", value: 41200, suffix: "EUR" },
      { id: "sb3", label: "Ratio de captura", value: 62 },
    ],
  },

  "/api/portal/revenue-os": {
    summary: { totalRevenue: 18400, leakedRevenue: 7300, activeSeats: 3, hotOpenLeads: 5, pendingInvoices: 1, trialReady: false },
    leakageMap: [
      { id: "stale", title: "Pipeline estancado", value: 6, body: "6 leads abiertos llevan demasiado tiempo sin moverse." },
      { id: "owner", title: "Leads sin owner", value: 4, body: "Nadie los está trabajando." },
      { id: "objection", title: "Objeciones sin respuesta", value: 11, body: "«Me lo tengo que pensar» sin ninguna acción posterior." },
    ],
    usageBilling: [
      { id: "u1", title: "Llamadas del mes", value: 40, body: "Dentro del plan contratado." },
      { id: "u2", title: "Minutos de voz", value: 96, body: "De 500 incluidos." },
    ],
    upgradeSignals: [
      { id: "us1", title: "Volumen cerca del límite del plan", body: "Dos meses seguidos por encima del 80 %.", level: "warning" },
    ],
    partnerProgram: [
      { id: "pp1", title: "Referidos", body: "Un mes gratis por cada cuenta que entre." },
    ],
  },

  "/api/portal/brand-lab": {
    summary: { readinessScore: 72, assets: 4, pending: 2 },
    preview: { brand: "Nesped Demo", primary: "#ffffff", secondary: "#030303" },
    suggestions: [
      { id: "b1", title: "Falta el logotipo en alta resolución", body: "Se está usando el texto como marca en emails y portal.", level: "warning" },
      { id: "b2", title: "Dominio propio sin configurar", body: "El portal se sirve todavía en nesped.com/portal.", level: "warning" },
      { id: "b3", title: "Tono de voz definido", body: "Cercano, directo, sin tecnicismos.", level: "ready" },
    ],
    catalog: [
      { id: "cat1", title: "Aerotermia", value: 4800, body: "Producto estrella" },
      { id: "cat2", title: "Placas solares", value: 3900 },
      { id: "cat3", title: "Ortodoncia invisible", value: 2800 },
    ],
  },

  "/api/portal/api-hub": {
    summary: { endpoints: 6, events: 9, keys: 1 },
    urls: [
      { id: "url1", title: "Base", body: "https://nesped.com/api" },
      { id: "url2", title: "Webhook de entrada", body: "https://nesped.com/api/portal/webhook" },
    ],
    endpoints: [
      { id: "e1", title: "GET /api/leads", body: "Lista de leads del cliente autenticado." },
      { id: "e2", title: "GET /api/leads/export", body: "Descarga en CSV." },
      { id: "e3", title: "POST /api/demo-call", body: "Lanza una llamada de demostración." },
      { id: "e4", title: "GET /api/portal/overview", body: "Todo el panel en una sola respuesta." },
    ],
    eventCatalog: [
      { id: "ev1", title: "lead.created", body: "Se dispara al capturar un lead nuevo." },
      { id: "ev2", title: "call.completed", body: "Al terminar y transcribir una llamada." },
      { id: "ev3", title: "lead.status_changed", body: "Al cambiar de fase en el pipeline." },
    ],
  },

  "/api/portal/integrations-center": {
    summary: { connected: 5, available: 9, pending: 2 },
    connectors: [
      { id: "i1", title: "Telnyx", body: "Telefonía de entrada y salida.", status: "warning" },
      { id: "i2", title: "ElevenLabs", body: "Agente de voz.", status: "ready" },
      { id: "i3", title: "Stripe", body: "Suscripciones y cobros.", status: "ready" },
      { id: "i4", title: "Resend", body: "Correo transaccional.", status: "ready" },
      { id: "i5", title: "Supabase", body: "Base de datos.", status: "ready" },
      { id: "i6", title: "Google Calendar", body: "Citas automáticas.", status: "missing" },
    ],
    identity: [
      { id: "id1", title: "Acceso por email y contraseña", body: "Activo.", status: "ready" },
      { id: "id2", title: "Segundo factor", body: "Obligatorio para roles de administración.", status: "ready" },
    ],
    privacy: [
      { id: "pr1", title: "Retención de grabaciones", body: "30 días." },
      { id: "pr2", title: "Retención de transcripciones", body: "90 días." },
      { id: "pr3", title: "Aviso de grabación", body: "Se anuncia al inicio de cada llamada." },
    ],
  },

  "/api/portal/workflows": {
    summary: { flows: 5, active: 3, runsToday: 28, failures: 0 },
    templates: [
      { id: "t1", title: "Devolución fuera de horario", body: "Llama a las 09:05 del día siguiente." },
      { id: "t2", title: "Segundo intento", body: "Reintenta a las 4 horas si no cogió." },
      { id: "t3", title: "SMS de presupuesto", body: "Manda el enlace en cuanto el lead pasa a cualificado." },
    ],
    flows: [
      { id: "f1", title: "Captura → asignación", body: "Reparte por carga de trabajo.", status: "active" },
      { id: "f2", title: "Cualificado → presupuesto", body: "Genera y envía el PDF.", status: "active" },
      { id: "f3", title: "Sin respuesta 7 días", body: "Marca como frío y avisa.", status: "paused" },
    ],
    logs: [
      { id: "lg1", title: "Devolución fuera de horario", body: "4 ejecuciones · sin errores", status: "ok" },
      { id: "lg2", title: "Segundo intento", body: "11 ejecuciones · sin errores", status: "ok" },
    ],
  },

  "/api/portal/enterprise": {
    summary: { readiness: 78, activeUsers: 3, elevatedUsers: 2, twoFactorCoverage: 100, auditEvents: 4, servicesReady: 5 },
    controls: [
      { id: "c1", title: "Segundo factor obligatorio", body: "Activo para owner y admin.", status: "ready" },
      { id: "c2", title: "Registro de auditoría", body: "Exportable en CSV.", status: "ready" },
      { id: "c3", title: "Dominio propio", body: "Sin configurar.", status: "missing" },
    ],
    risks: [
      { id: "r1", title: "Un usuario inactivo conserva acceso", body: "Marina Ortiz sigue dada de alta.", level: "warning" },
      { id: "r2", title: "Llamada saliente sin credencial", body: "Falta TELNYX_ACCOUNT_SID.", level: "critical" },
    ],
    serviceMap: [
      { id: "sm1", name: "Supabase", title: "Supabase", body: "Base de datos", status: "ready" },
      { id: "sm2", name: "Telnyx", title: "Telnyx", body: "Telefonía", status: "warning" },
      { id: "sm3", name: "Stripe", title: "Stripe", body: "Cobros", status: "ready" },
    ],
    auditHighlights: [
      { id: "ah1", title: "lead.status_changed", body: "leads · jaime@ejemplo.es", created_at: hace(0, 2) },
      { id: "ah2", title: "user.invited", body: "users · jaime@ejemplo.es", created_at: hace(2) },
    ],
    rollout: [
      { id: "ro1", title: "Fase 1 · Voz entrante", body: "Completada.", status: "ready" },
      { id: "ro2", title: "Fase 2 · Seguimiento automático", body: "En marcha.", status: "warning" },
      { id: "ro3", title: "Fase 3 · Multi-sede", body: "Pendiente.", status: "missing" },
    ],
  },

  "/api/portal/access-center": {
    summary: { users: 4, elevated: 2, twoFactor: 2, lastReview: 0 },
    permissionMatrix: {
      columns: [
        { id: "leads", title: "Leads" }, { id: "calls", title: "Llamadas" },
        { id: "billing", title: "Facturación" }, { id: "users", title: "Usuarios" },
        { id: "settings", title: "Ajustes" },
      ],
      rows: [
        { id: "u1", email: "jaime@ejemplo.es", permissions: { leads: true, calls: true, billing: true, users: true, settings: true } },
        { id: "u2", email: "laura@ejemplo.es", permissions: { leads: true, calls: true, billing: false, users: true, settings: true } },
        { id: "u3", email: "sergio@ejemplo.es", permissions: { leads: true, calls: true, billing: false, users: false, settings: false } },
        { id: "u4", email: "marina@ejemplo.es", permissions: { leads: false, calls: false, billing: false, users: false, settings: false } },
      ],
    },
    policies: [
      { id: "po1", title: "Segundo factor para roles elevados", body: "Owner y admin lo tienen obligatorio.", status: "ready" },
      { id: "po2", title: "Revisión trimestral de accesos", body: "Nunca se ha ejecutado.", status: "missing" },
    ],
    recommendations: [
      { id: "rc1", title: "Dar de baja a Marina Ortiz", body: "Inactiva desde hace 12 días pero con cuenta viva." },
    ],
    exportUrl: "#",
  },
};
