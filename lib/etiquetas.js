/**
 * Cómo se dicen en español los valores internos que se guardan en inglés.
 *
 * La base, Twilio, ElevenLabs y el código usan claves como `completed` o
 * `lead_captured`. Eso nunca debe llegar tal cual a una pantalla ni a un
 * correo: todo lo que ve una persona va en español de España. Este módulo no
 * importa nada de servidor, así que sirve igual en el portal que en los
 * correos.
 */

export const ESTADO_LLAMADA = {
  queued: "En cola",
  initiated: "Iniciada",
  ringing: "Sonando",
  "in-progress": "En curso",
  in_progress: "En curso",
  completed: "Completada",
  done: "Terminada",
  busy: "Ocupado",
  "no-answer": "Sin respuesta",
  no_answer: "Sin respuesta",
  failed: "Fallida",
  canceled: "Cancelada",
  cancelled: "Cancelada",
};

export const RESULTADO_LLAMADA = {
  lead_captured: "Contacto recogido",
  completed_without_lead: "Atendida sin datos de contacto",
  call_incomplete: "Llamada incompleta",
};

export const SENTIMIENTO = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
  mixed: "Mixto",
};

export const ESTADO_CONTACTO = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Cualificado",
  won: "Ganado",
  lost: "Perdido",
};

export const NIVEL_SALUD = {
  healthy: "Correcto",
  ok: "Correcto",
  low: "Bajo",
  warning: "Aviso",
  high: "Alto",
  critical: "Crítico",
  error: "Error",
  required: "Obligatorio",
  recommended: "Recomendado",
};

/** El texto en español de `valor` según `mapa`; si no está, el valor tal cual. */
export function etiqueta(mapa, valor, porDefecto = "—") {
  if (valor === null || valor === undefined || valor === "") return porDefecto;
  const clave = String(valor).trim();
  return mapa[clave] || mapa[clave.toLowerCase()] || clave;
}

/** Estados sueltos que llegan de integraciones y resúmenes genéricos. */
export const ESTADO_GENERAL = {
  open: "Abierto",
  closed: "Cerrado",
  pending: "Pendiente",
  active: "Activo",
  inactive: "Inactivo",
  resolved: "Resuelto",
  medium: "Medio",
  paid: "Pagado",
  unpaid: "Sin pagar",
  trialing: "En prueba",
  past_due: "Pago atrasado",
  unknown: "Desconocido",
  success: "Correcto",
  succeeded: "Correcto",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  received: "Recibido",
  undelivered: "No entregado",
  scheduled: "Programado",
};

/** Cualquier valor interno conocido, en español. */
export const TODAS = {
  ...ESTADO_GENERAL,
  ...NIVEL_SALUD,
  ...SENTIMIENTO,
  ...RESULTADO_LLAMADA,
  ...ESTADO_CONTACTO,
  ...ESTADO_LLAMADA,
};
