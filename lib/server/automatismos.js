/* =========================================================================
   Los automatismos: lo que Nesped hace por la empresa cuando pasa algo.

   Un catálogo de piezas, cada una con lo que vigila, cuándo salta, qué
   necesita (IA, un canal) y qué se puede configurar. Cada empresa tiene una
   fila por pieza —activo, modo, config— y cada vez que una pieza actúa
   queda una ejecución apuntada: qué hizo, con qué contacto, en qué modo.

   Tres modos, heredados de los agentes de siempre:
     avisar    → se detecta y se crea un aviso. No se toca nada.
     preparar  → se deja hecho (un borrador, una tarea) esperando a alguien.
     solo      → se ejecuta.

   Límites que no se negocian:
   - Con pausa_global de la plataforma, nada actúa: todo queda 'omitido'.
   - Lo que manda mensajes a un contacto respeta su consentimiento y el
     canal; sin canal, lo más que hace es preparar.
   - Lo que necesita entender texto (urgencia, enfado, oportunidad) sólo
     actúa si la IA está; si no, se omite y se dice por qué. No se finge.
   - Todo lo que sale de aquí lleva request_id y queda en ejecuciones.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { encolar } from "@/lib/server/cola";
import { interruptoresDePlataforma } from "@/lib/server/interruptores";
import { iaDisponible } from "@/lib/server/estado-ia";
import { contextoActual } from "@/lib/server/contexto.mjs";
import { notificarLead } from "@/lib/server/destinatarios";
import { configIA, dentroDeHorario } from "@/lib/server/ia-config";

export const MODOS = ["avisar", "preparar", "solo"];

/** Qué dispara cada pieza. */
export const DISPAROS = Object.freeze({
  "lead.nuevo": "Cuando entra un contacto nuevo",
  "lead.clasificado": "Cuando la IA clasifica un contacto",
  "mensaje.entrante": "Cuando llega un mensaje",
  "barrido": "Cada pocos minutos, revisando lo pendiente",
});

/**
 * El catálogo. `config` describe los campos que se enseñan; `porDefecto`
 * es el modo con el que se activa; `disponible` false explica qué falta.
 */
export const CATALOGO = Object.freeze([
  /* Avisos internos */
  { id: "notificar_departamentos", categoria: "Avisos internos", nombre: "Avisar al departamento por correo", queHace: "Manda cada contacto clasificado a las personas que atienden su departamento.", cuando: "lead.clasificado", modos: ["solo"], porDefecto: "solo", activoPorDefecto: true, config: [] },
  { id: "email_lead_importante", categoria: "Avisos internos", nombre: "Correo cuando llega un contacto importante", queHace: "Si la IA ve una oportunidad o un asunto de dirección, avisa además a quien tenga Dirección.", cuando: "lead.clasificado", necesitaIA: true, modos: ["avisar", "solo"], porDefecto: "solo", config: [] },
  { id: "escalar_direccion", categoria: "Avisos internos", nombre: "Escalar a dirección lo estratégico", queHace: "Marca el contacto como estratégico, crea un aviso alto y lo etiqueta para dirección.", cuando: "lead.clasificado", necesitaIA: true, modos: ["avisar", "solo"], porDefecto: "solo", config: [] },
  { id: "webhook_saliente", categoria: "Avisos internos", nombre: "Avisar al sistema del cliente (webhook)", queHace: "Manda el contacto clasificado al webhook saliente de la empresa, firmado.", cuando: "lead.clasificado", modos: ["solo"], porDefecto: "solo", config: [] },
  { id: "avisar_sin_respuesta", categoria: "Avisos internos", nombre: "Avisar si nadie contesta", queHace: "Si un contacto nuevo lleva demasiado sin que nadie lo toque, crea un aviso.", cuando: "barrido", modos: ["avisar"], porDefecto: "avisar", config: [{ clave: "minutos", label: "Minutos sin respuesta", tipo: "numero", porDefecto: 30, min: 5, max: 1440 }] },

  /* El contacto */
  { id: "etiquetar", categoria: "El contacto", nombre: "Etiquetar automáticamente", queHace: "Pone al contacto la etiqueta de su departamento y de las señales detectadas.", cuando: "lead.clasificado", modos: ["solo"], porDefecto: "solo", activoPorDefecto: true, config: [] },
  { id: "cambiar_estado", categoria: "El contacto", nombre: "Cambiar el estado según la intención", queHace: "Si la IA ve una oportunidad clara, pasa el contacto de 'nuevo' a 'cualificado'.", cuando: "lead.clasificado", necesitaIA: true, modos: ["avisar", "solo"], porDefecto: "avisar", config: [] },
  { id: "nota_interna", categoria: "El contacto", nombre: "Dejar una nota interna", queHace: "Escribe en el contacto una nota con la clasificación y su motivo.", cuando: "lead.clasificado", modos: ["solo"], porDefecto: "solo", config: [] },
  { id: "tarea_seguimiento", categoria: "El contacto", nombre: "Crear tarea de seguimiento", queHace: "Crea un recordatorio para llamar o escribir al contacto.", cuando: "lead.clasificado", modos: ["preparar", "solo"], porDefecto: "solo", config: [{ clave: "horas", label: "Horas hasta el seguimiento", tipo: "numero", porDefecto: 24, min: 1, max: 720 }] },
  { id: "reintentar_contacto", categoria: "El contacto", nombre: "Reintentar el contacto", queHace: "Si sigue en 'nuevo' pasadas X horas, crea otra tarea para volver a intentarlo.", cuando: "barrido", modos: ["preparar", "solo"], porDefecto: "solo", config: [{ clave: "horas", label: "Horas antes de reintentar", tipo: "numero", porDefecto: 48, min: 1, max: 720 }] },
  { id: "derivar_persona", categoria: "El contacto", nombre: "Derivar a una persona concreta", queHace: "Asigna los contactos de un departamento a alguien del equipo y lo apunta.", cuando: "lead.clasificado", modos: ["avisar", "solo"], porDefecto: "solo", config: [{ clave: "departamento", label: "Departamento", tipo: "departamento" }, { clave: "persona", label: "Correo de la persona", tipo: "email" }] },
  { id: "motivo_derivacion", categoria: "El contacto", nombre: "Registrar el motivo de cada derivación", queHace: "Cada vez que se deriva o escala, deja en el historial por qué.", cuando: "lead.clasificado", modos: ["solo"], porDefecto: "solo", activoPorDefecto: true, config: [] },

  /* Lo que entiende la IA */
  { id: "detectar_urgencia", categoria: "Lo que entiende la IA", nombre: "Detectar urgencia", queHace: "Si el contacto tiene prisa, aviso alto y etiqueta 'urgente'.", cuando: "lead.clasificado", necesitaIA: true, modos: ["avisar", "solo"], porDefecto: "solo", activoPorDefecto: true, config: [] },
  { id: "detectar_enfadado", categoria: "Lo que entiende la IA", nombre: "Detectar cliente enfadado", queHace: "Si viene enfadado, aviso alto, etiqueta y se sube la prioridad para que lo llame una persona.", cuando: "lead.clasificado", necesitaIA: true, modos: ["avisar", "solo"], porDefecto: "solo", activoPorDefecto: true, config: [] },
  { id: "detectar_oportunidad", categoria: "Lo que entiende la IA", nombre: "Detectar oportunidad comercial", queHace: "Si huele a venta, aviso y etiqueta 'oportunidad'.", cuando: "lead.clasificado", necesitaIA: true, modos: ["avisar", "solo"], porDefecto: "solo", activoPorDefecto: true, config: [] },
  { id: "borrador_respuesta", categoria: "Lo que entiende la IA", nombre: "Preparar un borrador de respuesta", queHace: "Escribe una respuesta con el tono de la empresa y la deja lista para que alguien la revise.", cuando: "lead.clasificado", necesitaIA: true, modos: ["preparar"], porDefecto: "preparar", config: [] },

  /* La conversación */
  { id: "pedir_datos_faltantes", categoria: "La conversación", nombre: "Pedir los datos que faltan", queHace: "Si falta el teléfono o el nombre, prepara el mensaje que los pide.", cuando: "lead.clasificado", canal: "whatsapp", modos: ["preparar", "solo"], porDefecto: "preparar", config: [] },
  { id: "bienvenida", categoria: "La conversación", nombre: "Mensaje de bienvenida", queHace: "Manda el mensaje de bienvenida configurado en la IA al primer contacto.", cuando: "lead.nuevo", canal: "whatsapp", modos: ["preparar", "solo"], porDefecto: "preparar", config: [] },
  { id: "fuera_horario", categoria: "La conversación", nombre: "Mensaje fuera de horario", queHace: "Fuera del horario configurado, contesta con el mensaje de fuera de horario.", cuando: "mensaje.entrante", canal: "whatsapp", modos: ["preparar", "solo"], porDefecto: "preparar", config: [] },
  { id: "bloquear_sin_consentimiento", categoria: "La conversación", nombre: "No escribir sin consentimiento", queHace: "Ningún mensaje automático sale a quien no haya dado su consentimiento.", cuando: "lead.clasificado", modos: ["solo"], porDefecto: "solo", activoPorDefecto: true, fijo: true, config: [] },

  /* Informes */
  { id: "resumen_diario", categoria: "Informes", nombre: "Resumen diario por correo", queHace: "Cada mañana, un correo con lo del día anterior.", cuando: "barrido", modos: ["solo"], porDefecto: "solo", config: [{ clave: "hora", label: "Hora de envío", tipo: "hora", porDefecto: "08:00" }] },
  { id: "resumen_semanal", categoria: "Informes", nombre: "Resumen semanal por correo", queHace: "Cada lunes, un correo con la semana.", cuando: "barrido", modos: ["solo"], porDefecto: "solo", config: [{ clave: "hora", label: "Hora de envío", tipo: "hora", porDefecto: "08:00" }] },
]);

export const POR_ID = Object.fromEntries(CATALOGO.map((a) => [a.id, a]));

/** Las filas de una empresa fundidas con el catálogo: lo que va a pasar. */
export async function automatismosDeEmpresa(clientId, supabase = getSupabase()) {
  const { data, error } = await supabase.from("automatismos").select("*").eq("client_id", clientId);
  if (error) throw new Error(error.message);
  const filas = new Map((data || []).map((f) => [f.tipo, f]));
  return CATALOGO.map((a) => {
    const f = filas.get(a.id);
    const activo = f ? f.activo : Boolean(a.activoPorDefecto);
    const modo = f?.modo && a.modos.includes(f.modo) ? f.modo : a.porDefecto;
    const config = Object.fromEntries(a.config.map((c) => [c.clave, f?.config?.[c.clave] ?? c.porDefecto ?? null]));
    /* `campos` describe lo configurable; `config` son los valores. */
    return { ...a, campos: a.config, activo, modo, config, guardado: Boolean(f) };
  });
}

/** Guarda activo/modo/config de una pieza. Valida contra el catálogo. */
export async function fijarAutomatismo(clientId, tipo, { activo, modo, config } = {}, supabase = getSupabase()) {
  const a = POR_ID[tipo];
  if (!a) throw new Error("Automatismo desconocido");
  if (a.fijo && activo === false) throw new Error("Este automatismo no se puede apagar");
  const fila = { client_id: clientId, tipo, updated_at: new Date().toISOString() };
  if (typeof activo === "boolean") fila.activo = activo;
  if (modo !== undefined) {
    if (!a.modos.includes(modo)) throw new Error(`Modo no permitido para ${a.nombre}`);
    fila.modo = modo;
  }
  if (config && typeof config === "object") {
    const limpio = {};
    for (const c of a.config) {
      if (config[c.clave] === undefined) continue;
      let v = config[c.clave];
      if (c.tipo === "numero") { v = Number(v); if (!Number.isFinite(v)) continue; v = Math.min(c.max ?? 1e9, Math.max(c.min ?? 0, v)); }
      else if (c.tipo === "hora") { v = String(v); if (!/^\d{2}:\d{2}$/.test(v)) continue; }
      else if (c.tipo === "email") { v = String(v).trim().toLowerCase().slice(0, 254); }
      else v = String(v).trim().slice(0, 120);
      limpio[c.clave] = v;
    }
    fila.config = limpio;
  }
  const { error } = await supabase.from("automatismos").upsert(fila, { onConflict: "client_id,tipo" });
  if (error) throw new Error(error.message);
  return fila;
}

/* ── ejecución ────────────────────────────────────────────────────────── */

async function apuntar(supabase, { clientId, tipo, leadId, modo, resultado, detalle }) {
  await supabase.from("automatismos_ejecuciones").insert({
    client_id: clientId, tipo, lead_id: leadId || null, modo, resultado,
    detalle: detalle || null, request_id: contextoActual().request_id || null,
  }).then(({ error }) => { if (error) console.error("[automatismos] no se pudo apuntar:", error.message); });
}

async function aviso(supabase, { clientId, leadId, severity = "medium", title, message, kind = "automatismo" }) {
  await supabase.from("alerts").insert({ client_id: clientId, kind, severity, title, message, related_lead_id: leadId || null });
}

async function etiqueta(supabase, { clientId, lead, tags }) {
  const actuales = Array.isArray(lead.tags) ? lead.tags : [];
  const nuevas = [...new Set([...actuales, ...tags.filter(Boolean)])];
  if (nuevas.length === actuales.length) return false;
  await supabase.from("leads").update({ tags: nuevas }).eq("id", lead.id).eq("client_id", clientId);
  lead.tags = nuevas;
  return true;
}

async function evento(supabase, { clientId, leadId, type, title, description }) {
  await supabase.from("lead_events").insert({ client_id: clientId, lead_id: leadId, type, title, description });
}

/**
 * Las acciones. Cada una recibe el contexto y devuelve { resultado, detalle }.
 * `s` son señales de la clasificación; `c` la configuración de la pieza.
 */
const ACCIONES = {
  async notificar_departamentos({ supabase, clientId, lead, clasificacion }) {
    const r = await notificarLead({ clientId, lead, clasificacion, supabase });
    if (!r.destinatarios.length) return { resultado: "omitido", detalle: { motivo: "nadie atiende este departamento" } };
    return { resultado: r.fallidos && !r.enviados ? "fallido" : "hecho", detalle: r };
  },
  async email_lead_importante({ supabase, clientId, lead, clasificacion, modo, s }) {
    if (!s.importante && !s.oportunidad) return { resultado: "omitido", detalle: { motivo: "no es importante" } };
    if (modo === "avisar") { await aviso(supabase, { clientId, leadId: lead.id, severity: "high", title: "Contacto importante", message: clasificacion.motivo }); return { resultado: "avisado" }; }
    const r = await notificarLead({ clientId, lead, clasificacion: { ...clasificacion, departamento: "direccion", senales: { ...s, importante: true } }, supabase });
    return { resultado: r.destinatarios.length ? "hecho" : "omitido", detalle: r.destinatarios.length ? r : { motivo: "nadie tiene Dirección asignada" } };
  },
  async escalar_direccion({ supabase, clientId, lead, clasificacion, modo, s }) {
    if (!s.importante) return { resultado: "omitido", detalle: { motivo: "no es estratégico" } };
    await aviso(supabase, { clientId, leadId: lead.id, severity: "high", title: "Escalar a dirección", message: clasificacion.motivo });
    if (modo === "avisar") return { resultado: "avisado" };
    await etiqueta(supabase, { clientId, lead, tags: ["direccion", "estrategico"] });
    return { resultado: "hecho" };
  },
  async webhook_saliente({ clientId, lead, clasificacion }) {
    const { emitirWebhook } = await import("@/lib/server/webhooks-salientes");
    const id = await emitirWebhook({ clientId, evento: "nesped.contacto.clasificado", datos: { lead_id: lead.id, departamento: clasificacion.departamento, motivo: clasificacion.motivo, senales: clasificacion.senales || {} } });
    return { resultado: id ? "hecho" : "omitido", detalle: id ? { entrega: id } : { motivo: "la empresa no tiene webhook" } };
  },
  async etiquetar({ supabase, clientId, lead, clasificacion, s }) {
    const tags = [clasificacion.departamento, s.urgente && "urgente", s.enfadado && "enfadado", s.oportunidad && "oportunidad"].filter(Boolean);
    const cambio = await etiqueta(supabase, { clientId, lead, tags });
    return { resultado: cambio ? "hecho" : "omitido", detalle: { tags } };
  },
  async cambiar_estado({ supabase, clientId, lead, modo, s }) {
    if (!s.oportunidad || String(lead.status || "new") !== "new") return { resultado: "omitido", detalle: { motivo: "sin oportunidad clara o ya movido" } };
    if (modo === "avisar") { await aviso(supabase, { clientId, leadId: lead.id, title: "Parece una oportunidad", message: "Podría pasar a cualificado." }); return { resultado: "avisado" }; }
    await supabase.from("leads").update({ status: "qualified", ultima_accion: "Cualificado por la IA" }).eq("id", lead.id).eq("client_id", clientId);
    return { resultado: "hecho", detalle: { de: "new", a: "qualified" } };
  },
  async nota_interna({ supabase, clientId, lead, clasificacion }) {
    await supabase.from("lead_notes").insert({ client_id: clientId, lead_id: lead.id, author: "Nesped", body: `Clasificado en ${clasificacion.nombreDepartamento || clasificacion.departamento}: ${clasificacion.motivo}` });
    return { resultado: "hecho" };
  },
  async tarea_seguimiento({ supabase, clientId, lead, modo, c }) {
    const horas = Number(c.horas) || 24;
    const cuando = new Date(Date.now() + horas * 3600e3).toISOString();
    await supabase.from("lead_reminders").insert({ client_id: clientId, lead_id: lead.id, title: `Seguimiento: ${lead.nombre || lead.telefono || "contacto"}`, remind_at: cuando, assigned_to: lead.owner || "" });
    return { resultado: modo === "preparar" ? "preparado" : "hecho", detalle: { remind_at: cuando } };
  },
  async derivar_persona({ supabase, clientId, lead, clasificacion, modo, c }) {
    if (!c.persona || (c.departamento && c.departamento !== clasificacion.departamento)) return { resultado: "omitido", detalle: { motivo: "no aplica a este departamento" } };
    if (modo === "avisar") { await aviso(supabase, { clientId, leadId: lead.id, title: "Derivar", message: `Para ${c.persona}` }); return { resultado: "avisado" }; }
    await supabase.from("leads").update({ owner: c.persona }).eq("id", lead.id).eq("client_id", clientId);
    lead.owner = c.persona; lead._derivado = c.persona;
    return { resultado: "hecho", detalle: { a: c.persona } };
  },
  async motivo_derivacion({ supabase, clientId, lead, clasificacion, s }) {
    if (!lead._derivado && !s.importante) return { resultado: "omitido", detalle: { motivo: "no hubo derivación" } };
    await evento(supabase, { clientId, leadId: lead.id, type: "derivacion", title: lead._derivado ? `Derivado a ${lead._derivado}` : "Escalado a dirección", description: clasificacion.motivo });
    return { resultado: "hecho" };
  },
  async detectar_urgencia({ supabase, clientId, lead, clasificacion, modo, s }) {
    if (!s.urgente) return { resultado: "omitido", detalle: { motivo: "sin urgencia" } };
    await aviso(supabase, { clientId, leadId: lead.id, severity: "high", title: "Contacto urgente", message: clasificacion.motivo });
    if (modo === "solo") await etiqueta(supabase, { clientId, lead, tags: ["urgente"] });
    return { resultado: modo === "solo" ? "hecho" : "avisado" };
  },
  async detectar_enfadado({ supabase, clientId, lead, clasificacion, modo, s }) {
    if (!s.enfadado) return { resultado: "omitido", detalle: { motivo: "sin enfado" } };
    await aviso(supabase, { clientId, leadId: lead.id, severity: "high", title: "Cliente enfadado: que lo llame una persona", message: clasificacion.motivo });
    if (modo === "solo") {
      await etiqueta(supabase, { clientId, lead, tags: ["enfadado"] });
      await supabase.from("leads").update({ priority_bucket: "alta", priority_reason: "Cliente enfadado (IA)", auto_mode: false }).eq("id", lead.id).eq("client_id", clientId);
    }
    return { resultado: modo === "solo" ? "hecho" : "avisado" };
  },
  async detectar_oportunidad({ supabase, clientId, lead, clasificacion, modo, s }) {
    if (!s.oportunidad) return { resultado: "omitido", detalle: { motivo: "sin oportunidad" } };
    await aviso(supabase, { clientId, leadId: lead.id, severity: "medium", title: "Oportunidad comercial", message: clasificacion.motivo });
    if (modo === "solo") await etiqueta(supabase, { clientId, lead, tags: ["oportunidad"] });
    return { resultado: modo === "solo" ? "hecho" : "avisado" };
  },
  async borrador_respuesta({ supabase, clientId, lead, clasificacion, ia }) {
    const { borradorDeRespuesta } = await import("@/lib/server/ia-config");
    const texto = await borradorDeRespuesta({ clientId, lead, clasificacion, config: ia });
    if (!texto) return { resultado: "omitido", detalle: { motivo: "sin texto" } };
    await supabase.from("leads").update({ next_action: "Responder", next_action_message: texto, next_action_reason: "Borrador preparado por la IA", next_action_updated_at: new Date().toISOString() }).eq("id", lead.id).eq("client_id", clientId);
    return { resultado: "preparado", detalle: { caracteres: texto.length } };
  },
  async pedir_datos_faltantes({ supabase, clientId, lead, modo, canalWhatsapp, consentimiento }) {
    const faltan = [!lead.nombre && "nombre", !lead.telefono && "teléfono"].filter(Boolean);
    if (!faltan.length) return { resultado: "omitido", detalle: { motivo: "no falta nada" } };
    const texto = `Hola${lead.nombre ? ` ${lead.nombre}` : ""}, para poder atenderte bien, ¿me dices tu ${faltan.join(" y ")}?`;
    if (modo === "solo" && canalWhatsapp && consentimiento) return { resultado: "omitido", detalle: { motivo: "el envío por WhatsApp aún no está conectado" } };
    await supabase.from("leads").update({ next_action: "Pedir datos", next_action_message: texto, next_action_updated_at: new Date().toISOString() }).eq("id", lead.id).eq("client_id", clientId);
    return { resultado: "preparado", detalle: { faltan } };
  },
  async bienvenida({ supabase, clientId, lead, ia }) {
    const texto = ia.mensaje_bienvenida;
    if (!texto) return { resultado: "omitido", detalle: { motivo: "sin mensaje de bienvenida configurado" } };
    await supabase.from("leads").update({ next_action: "Dar la bienvenida", next_action_message: texto, next_action_updated_at: new Date().toISOString() }).eq("id", lead.id).eq("client_id", clientId);
    return { resultado: "preparado" };
  },
  async fuera_horario({ supabase, clientId, lead, ia }) {
    if (dentroDeHorario(ia)) return { resultado: "omitido", detalle: { motivo: "estamos en horario" } };
    const texto = ia.mensaje_fuera_horario;
    if (!texto) return { resultado: "omitido", detalle: { motivo: "sin mensaje de fuera de horario" } };
    await supabase.from("leads").update({ next_action: "Fuera de horario", next_action_message: texto, next_action_updated_at: new Date().toISOString() }).eq("id", lead.id).eq("client_id", clientId);
    return { resultado: "preparado" };
  },
  async bloquear_sin_consentimiento({ consentimiento }) {
    return { resultado: consentimiento ? "omitido" : "hecho", detalle: consentimiento ? { motivo: "hay consentimiento" } : { motivo: "sin consentimiento: los mensajes automáticos quedan sólo preparados" } };
  },
};

/**
 * Ejecuta lo que toque para un disparo. Nunca lanza: cada pieza cae por su
 * cuenta y queda apuntada como 'fallido'.
 */
export async function ejecutarAutomatismos({ clientId, disparo, lead, clasificacion = null, supabase = getSupabase() }) {
  const hechos = [];
  if (!clientId || !lead?.id) return hechos;

  let plataforma;
  try { plataforma = await interruptoresDePlataforma(); } catch { plataforma = {}; }
  const piezas = (await automatismosDeEmpresa(clientId, supabase)).filter((a) => a.activo && a.cuando === disparo);
  if (!piezas.length) return hechos;

  if (plataforma?.pausa_global) {
    for (const a of piezas) await apuntar(supabase, { clientId, tipo: a.id, leadId: lead.id, modo: a.modo, resultado: "omitido", detalle: { motivo: "pausa global" } });
    return piezas.map((a) => ({ tipo: a.id, resultado: "omitido" }));
  }

  const [ia, estadoIA, { data: empresa }] = await Promise.all([
    configIA(clientId, supabase),
    iaDisponible(clientId),
    supabase.from("clients").select("twilio_number").eq("id", clientId).maybeSingle(),
  ]);
  const s = clasificacion?.senales || {};
  const base = {
    supabase, clientId, lead, clasificacion: clasificacion || { departamento: lead.departamento, motivo: lead.departamento_motivo || "", senales: s },
    s, ia, canalWhatsapp: false, telefono: Boolean(empresa?.twilio_number),
    consentimiento: lead.whatsapp_opt_in !== false && lead.sms_opt_in !== false,
  };

  /* La pieza de consentimiento va primero: decide para las demás. */
  const orden = [...piezas].sort((a, b) => (a.id === "bloquear_sin_consentimiento" ? -1 : b.id === "bloquear_sin_consentimiento" ? 1 : 0));

  for (const a of orden) {
    const accion = ACCIONES[a.id];
    if (!accion) continue;
    let salida;
    try {
      if (a.necesitaIA && !estadoIA.ok) salida = { resultado: "omitido", detalle: { motivo: `necesita la IA y no está: ${estadoIA.motivo}` } };
      else if (a.necesitaIA && clasificacion && clasificacion.fuente !== "ia") salida = { resultado: "omitido", detalle: { motivo: "la clasificación fue por palabras clave, no por IA" } };
      else salida = await accion({ ...base, modo: a.modo, c: a.config });
    } catch (err) {
      salida = { resultado: "fallido", detalle: { error: String(err?.message || err).slice(0, 300) } };
      console.error(`[automatismos] ${a.id} falló:`, err?.message || err);
    }
    await apuntar(supabase, { clientId, tipo: a.id, leadId: lead.id, modo: a.modo, resultado: salida.resultado, detalle: salida.detalle });
    hechos.push({ tipo: a.id, resultado: salida.resultado, detalle: salida.detalle || null });
  }
  return hechos;
}

/**
 * El barrido: lo que se revisa cada pocos minutos para todas las empresas
 * con alguna pieza de barrido activa. Lo llama la cola.
 */
export async function barridoDeAutomatismos({ supabase = getSupabase(), ahora = new Date() } = {}) {
  const { data: filas, error } = await supabase.from("automatismos").select("client_id, tipo, modo, config").eq("activo", true)
    .in("tipo", CATALOGO.filter((a) => a.cuando === "barrido").map((a) => a.id));
  if (error) throw new Error(error.message);
  const resumen = { empresas: 0, avisos: 0, tareas: 0, informes: 0 };
  const porEmpresa = new Map();
  for (const f of filas || []) { if (!porEmpresa.has(f.client_id)) porEmpresa.set(f.client_id, []); porEmpresa.get(f.client_id).push(f); }
  let plataforma;
  try { plataforma = await interruptoresDePlataforma(); } catch { plataforma = {}; }
  if (plataforma?.pausa_global) return { ...resumen, pausado: true };

  for (const [clientId, piezas] of porEmpresa) {
    resumen.empresas += 1;
    for (const p of piezas) {
      const a = POR_ID[p.tipo];
      const c = Object.fromEntries(a.config.map((x) => [x.clave, p.config?.[x.clave] ?? x.porDefecto]));
      try {
        if (p.tipo === "avisar_sin_respuesta") {
          const limite = new Date(ahora.getTime() - (Number(c.minutos) || 30) * 60e3).toISOString();
          const { data: leads } = await supabase.from("leads").select("id, nombre, telefono, created_at")
            .eq("client_id", clientId).eq("status", "new").is("last_contact_at", null).lt("created_at", limite).limit(50);
          for (const l of leads || []) {
            const { data: ya } = await supabase.from("automatismos_ejecuciones").select("id").eq("client_id", clientId).eq("tipo", p.tipo).eq("lead_id", l.id).limit(1);
            if (ya?.length) continue;
            await aviso(supabase, { clientId, leadId: l.id, severity: "medium", title: "Nadie ha contestado", message: `${l.nombre || l.telefono || "Un contacto"} lleva más de ${c.minutos} minutos sin respuesta.` });
            await apuntar(supabase, { clientId, tipo: p.tipo, leadId: l.id, modo: p.modo, resultado: "avisado", detalle: { minutos: c.minutos } });
            resumen.avisos += 1;
          }
        } else if (p.tipo === "reintentar_contacto") {
          const limite = new Date(ahora.getTime() - (Number(c.horas) || 48) * 3600e3).toISOString();
          const { data: leads } = await supabase.from("leads").select("id, nombre, telefono, owner")
            .eq("client_id", clientId).eq("status", "new").lt("created_at", limite).limit(50);
          for (const l of leads || []) {
            const { data: ya } = await supabase.from("automatismos_ejecuciones").select("id").eq("client_id", clientId).eq("tipo", p.tipo).eq("lead_id", l.id).limit(1);
            if (ya?.length) continue;
            await supabase.from("lead_reminders").insert({ client_id: clientId, lead_id: l.id, title: `Reintentar: ${l.nombre || l.telefono || "contacto"}`, remind_at: ahora.toISOString(), assigned_to: l.owner || "" });
            await apuntar(supabase, { clientId, tipo: p.tipo, leadId: l.id, modo: p.modo, resultado: p.modo === "solo" ? "hecho" : "preparado", detalle: { horas: c.horas } });
            resumen.tareas += 1;
          }
        } else if (p.tipo === "resumen_diario" || p.tipo === "resumen_semanal") {
          const [hh, mm] = String(c.hora || "08:00").split(":").map(Number);
          const local = new Date(ahora.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
          const esLunes = local.getDay() === 1;
          if (p.tipo === "resumen_semanal" && !esLunes) continue;
          if (local.getHours() < hh || (local.getHours() === hh && local.getMinutes() < mm)) continue;
          const hoy = local.toISOString().slice(0, 10);
          const tipo = p.tipo === "resumen_diario" ? "informe_diario" : "informe_semanal";
          const { yaEstaba } = await encolar({ tipo, clientId, datos: {}, clave: `${tipo}:${clientId}:${hoy}`, unaSolaVez: true });
          if (!yaEstaba) { await apuntar(supabase, { clientId, tipo: p.tipo, leadId: null, modo: p.modo, resultado: "hecho", detalle: { dia: hoy } }); resumen.informes += 1; }
        }
      } catch (err) {
        console.error(`[automatismos] barrido ${p.tipo} ${clientId}:`, err?.message || err);
        await apuntar(supabase, { clientId, tipo: p.tipo, leadId: null, modo: p.modo, resultado: "fallido", detalle: { error: String(err?.message || err).slice(0, 300) } });
      }
    }
  }
  return resumen;
}

/** Las últimas ejecuciones de una empresa, para la pantalla. */
export async function ejecucionesRecientes(clientId, { cuantas = 40, supabase = getSupabase() } = {}) {
  const { data, error } = await supabase.from("automatismos_ejecuciones")
    .select("id, tipo, lead_id, modo, resultado, detalle, created_at")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(cuantas);
  if (error) throw new Error(error.message);
  return (data || []).map((e) => ({ ...e, nombre: POR_ID[e.tipo]?.nombre || e.tipo }));
}
