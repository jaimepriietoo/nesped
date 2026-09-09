/**
 * La ficha de un contacto: quién es, por dónde ha pasado y qué hacer ahora.
 *
 * Tres cosas viven aquí porque las tres se leen a la vez y ninguna tiene
 * sentido sola. Un recorrido sin recomendación es un archivo; una
 * recomendación sin recorrido es una orden sin motivo, y nadie ejecuta una
 * orden que no entiende.
 */

/** Motivos de pérdida, en el mismo orden que ofrece la ficha. */
export const MOTIVOS_PERDIDA = {
  precio: "Precio",
  competencia: "Se fue con otro",
  seguimiento: "Se enfrió por falta de seguimiento",
  tiempo: "Plazos",
  no_encaja: "No encajaba",
  sin_respuesta: "Dejó de contestar",
  otro: "Otro",
};

const dias = (ms) => ms / 864e5;

function aFecha(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * El recorrido, montado a partir de lo que ya se guarda.
 *
 * No hay una tabla de "eventos del cliente" que lo tenga todo: hay llamadas,
 * eventos de lead y registro de auditoría, cada uno con su forma. Se
 * normalizan a una sola lista ordenada por tiempo, que es como lo lee una
 * persona: de arriba abajo, sin importarle de qué tabla salió cada cosa.
 */
function montarRecorrido({ lead, llamadas, eventos, auditoria }) {
  const hitos = [];

  const alta = aFecha(lead.created_at);
  if (alta) {
    hitos.push({
      cuando: alta,
      tipo: "alta",
      titulo: "Entró en Nesped",
      detalle: lead.origen || lead.fuente || "Origen sin registrar",
    });
  }

  for (const c of llamadas) {
    const cuando = aFecha(c.created_at);
    if (!cuando) continue;
    const seg = c.duration_seconds || 0;
    hitos.push({
      cuando,
      tipo: "llamada",
      titulo: seg > 5 ? "Llamada atendida" : "Llamada muy corta",
      detalle: c.summary || c.detected_intent || "",
      /* Lo que se sabe de la llamada sin abrir la transcripción. Si el
         análisis no llegó a correr, estos campos van vacíos y la interfaz
         no pinta nada: no se rellenan con "neutro" ni con "media". */
      duracion: seg,
      sentimiento: c.sentiment || null,
      intencion: c.detected_intent || null,
      resultado: c.call_outcome || null,
      captado: c.lead_captured === true,
      grabacion: c.recording_url || null,
      transcripcion: c.transcript || null,
    });
  }

  for (const e of eventos) {
    const cuando = aFecha(e.created_at);
    if (!cuando) continue;
    hitos.push({
      cuando,
      tipo: e.type || "evento",
      titulo: e.title || e.type || "Evento",
      detalle: e.description || "",
    });
  }

  for (const a of auditoria) {
    const cuando = aFecha(a.created_at);
    if (!cuando) continue;
    /* Sólo los cambios que cuentan algo del contacto. El registro de
       auditoría guarda mucho ruido de sistema que en un recorrido comercial
       no aporta y sí estorba. */
    const cambios = a.changes || {};
    if (!("status" in cambios) && !("owner" in cambios)) continue;
    hitos.push({
      cuando,
      tipo: "cambio",
      titulo: "status" in cambios ? `Pasa a ${cambios.status}` : `Asignado a ${cambios.owner || "nadie"}`,
      detalle: a.actor ? `Por ${a.actor}` : "",
    });
  }

  return hitos.sort((a, b) => b.cuando - a.cuando);
}

/**
 * Qué se sabe de este cliente por su historial.
 *
 * Se agrupa por teléfono, no por fila: la misma persona puede haber entrado
 * varias veces como contactos distintos, y sumarlos es justo lo que convierte
 * una lista de operaciones en un cliente.
 */
function perfilDelCliente({ lead, hermanos }) {
  const ganadas = hermanos.filter((l) => String(l.status || "").toLowerCase() === "won");
  const conImporte = ganadas.filter((l) => Number(l.valor_estimado) > 0);

  if (!ganadas.length) {
    return {
      disponible: false,
      falta: "Todavía no ha comprado nada.",
      porQue: "En cuanto marques una operación suya como ganada, aquí sale lo que vale y cada cuánto vuelve.",
    };
  }

  const total = conImporte.reduce((a, l) => a + Number(l.valor_estimado), 0);
  const fechas = ganadas
    .map((l) => aFecha(l.updated_at || l.created_at))
    .filter(Boolean)
    .sort((a, b) => a - b);

  let cadaDias = null;
  if (fechas.length >= 2) {
    const huecos = fechas.slice(1).map((f, i) => dias(f - fechas[i]));
    cadaDias = Math.round(huecos.reduce((a, b) => a + b, 0) / huecos.length);
  }

  const ultima = fechas[fechas.length - 1];
  const sinComprar = ultima ? Math.round(dias(Date.now() - ultima)) : null;

  return {
    disponible: true,
    compras: ganadas.length,
    total: Math.round(total),
    ticket: conImporte.length ? Math.round(total / conImporte.length) : null,
    cadaDias,
    sinComprar,
    /* Se enfría cuando lleva más del doble de su propio ritmo sin volver.
       Es una regla comprobable a mano, no una probabilidad de un modelo. */
    enfriandose: cadaDias != null && sinComprar != null && sinComprar > cadaDias * 2,
    /* Sin importes no se puede hablar de ticket, y decirlo es mejor que
       enseñar un cero que parece que no compró. */
    sinImportes: conImporte.length === 0,
    nombre: lead.nombre || lead.telefono,
  };
}

/**
 * Qué hacer ahora, y por qué.
 *
 * No llama al modelo de lenguaje: usa lo que ya está guardado en el contacto,
 * que es lo que escribe el servicio de siguiente acción cuando corre. Si nunca
 * ha corrido, se dice, en vez de inventar una recomendación al vuelo que
 * cambiaría cada vez que se abre la ficha.
 */
function siguienteAccion({ lead, recorrido }) {
  const estado = String(lead.status || "new").toLowerCase();

  if (estado === "won" || estado === "lost") {
    return {
      disponible: false,
      falta: estado === "won" ? "Operación ganada. No hay nada pendiente." : "Operación perdida.",
    };
  }

  if (lead.next_action && lead.next_action !== "wait") {
    return {
      disponible: true,
      accion: lead.next_action,
      motivo: lead.next_action_reason || "",
      mensaje: lead.next_action_message || "",
      prioridad: lead.next_action_priority || "medium",
      calculada: lead.next_action_updated_at || null,
    };
  }

  /* Sin recomendación guardada se cae a lo único que se puede afirmar sin
     modelo: cuánto lleva esperando. Es menos vistoso que una probabilidad,
     y es verdad. */
  const ultimoContacto =
    aFecha(lead.last_contact_at) || aFecha(lead.last_contacted_at) || aFecha(lead.created_at);
  const esperando = ultimoContacto ? Math.round(dias(Date.now() - ultimoContacto)) : null;
  const hablado = recorrido.some((h) => h.tipo === "llamada" && h.duracion > 5);

  if (esperando != null && esperando >= 1) {
    return {
      disponible: true,
      accion: "call",
      motivo: hablado
        ? `Habló con el agente y lleva ${esperando} ${esperando === 1 ? "día" : "días"} sin que nadie le devuelva la llamada.`
        : `Lleva ${esperando} ${esperando === 1 ? "día" : "días"} en la cartera sin ningún contacto registrado.`,
      mensaje: "",
      prioridad: esperando >= 3 ? "high" : "medium",
      calculada: null,
      porReglas: true,
    };
  }

  return {
    disponible: false,
    falta: "Entró hoy. Todavía no toca insistir.",
  };
}

export async function fichaDeContacto({ supabase, clientId, leadId }) {
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!lead) return null;

  const telefono = String(lead.telefono || "").replace(/[^\d+]/g, "");

  const [llamadas, eventos, auditoria, hermanos] = await Promise.all([
    telefono
      ? supabase
          .from("calls")
          .select("created_at,duration_seconds,summary,sentiment,detected_intent,call_outcome,lead_captured,recording_url,transcript")
          .eq("client_id", clientId)
          .or(`from_number.eq.${telefono},phone.eq.${telefono}`)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    supabase
      .from("lead_events")
      .select("created_at,type,title,description")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("audit_logs")
      .select("created_at,actor,changes")
      .eq("client_id", clientId)
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50),
    telefono
      ? supabase
          .from("leads")
          .select("id,status,valor_estimado,created_at,updated_at")
          .eq("client_id", clientId)
          .eq("telefono", lead.telefono)
      : Promise.resolve({ data: [] }),
  ]);

  const recorrido = montarRecorrido({
    lead,
    llamadas: llamadas.data || [],
    eventos: eventos.data || [],
    auditoria: auditoria.data || [],
  });

  return {
    lead,
    recorrido,
    perfil: perfilDelCliente({ lead, hermanos: hermanos.data || [] }),
    siguiente: siguienteAccion({ lead, recorrido }),
    motivoPerdida: lead.lost_reason ? MOTIVOS_PERDIDA[lead.lost_reason] || lead.lost_reason : null,
  };
}
