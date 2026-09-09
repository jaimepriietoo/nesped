/**
 * Los agentes: qué vigila Nesped y qué se le deja hacer solo.
 *
 * Tres modos, y el orden importa porque describe cómo se gana la confianza:
 *
 *   avisar    → Nesped detecta y te lo dice. No toca nada.
 *   preparar  → Nesped deja la acción escrita y esperando tu visto bueno.
 *   solo      → Nesped la ejecuta sin preguntar.
 *
 * Nada arranca en "solo" y nada se puede poner en "solo" mientras el canal
 * que necesita no esté conectado. Un agente que manda mensajes en nombre de
 * una empresa a clientes reales no es una casilla más de configuración: si se
 * equivoca, el que queda mal es quien paga esto.
 *
 * Cada agente declara qué canal necesita. Mientras ese canal no exista, el
 * agente vive en "avisar" y lo dice, en vez de fingir que está encendido.
 */

export const MODOS = {
  avisar: {
    id: "avisar",
    nombre: "Solo avisar",
    descripcion: "Nesped lo detecta y te lo cuenta. No hace nada más.",
  },
  preparar: {
    id: "preparar",
    nombre: "Preparar y esperar",
    descripcion: "Deja el mensaje o la llamada listos, y no salen hasta que tú digas.",
  },
  solo: {
    id: "solo",
    nombre: "Hacerlo solo",
    descripcion: "Nesped ejecuta sin preguntarte. Queda registrado todo.",
  },
};

/**
 * @typedef {Object} Agente
 * @property {string} id
 * @property {string} nombre
 * @property {string} queHace     Qué vigila, en una frase.
 * @property {string} cuandoActua Qué le hace saltar.
 * @property {string} canal       Qué hace falta para que pueda ejecutar.
 * @property {string} ajuste      Columna de client_settings que guarda si ejecuta solo.
 */

/** @type {Agente[]} */
export const AGENTES = [
  {
    id: "rescate",
    nombre: "Rescate de contactos",
    queHace: "Vigila a quien entró y se quedó esperando sin que nadie le dijera nada.",
    cuandoActua: "Cuando un contacto lleva más de 24 h sin ningún contacto registrado.",
    canal: "telefono",
    ajuste: "auto_voice_enabled",
    /* Este es el que más dinero recupera y el que menos riesgo tiene: llamar
       a alguien que acaba de pedir un presupuesto no molesta a nadie. */
    recomendado: "preparar",
  },
  {
    id: "reactivacion",
    nombre: "Reactivación de clientes",
    queHace: "Avisa cuando un cliente que compraba con regularidad lleva demasiado sin volver.",
    cuandoActua: "Cuando pasa más del doble de su tiempo habitual entre compras.",
    canal: "whatsapp",
    ajuste: "auto_whatsapp_enabled",
    recomendado: "avisar",
  },
  {
    id: "seguimiento",
    nombre: "Seguimiento de presupuestos",
    queHace: "Persigue las operaciones abiertas que se están quedando frías.",
    cuandoActua: "Cuando una operación lleva días sin moverse de fase.",
    canal: "whatsapp",
    ajuste: "auto_sms_enabled",
    recomendado: "preparar",
  },
  {
    id: "citas",
    nombre: "Confirmación de citas",
    queHace: "Recuerda las visitas y confirma que siguen en pie.",
    cuandoActua: "El día antes de una cita agendada.",
    canal: "whatsapp",
    ajuste: "auto_sms_enabled",
    /* Necesita una agenda que Nesped todavía no tiene. Se declara porque es
       parte del producto, y se dice qué le falta. */
    bloqueado: "Nesped todavía no gestiona agenda de citas.",
    recomendado: "avisar",
  },
];

/** Canales y qué hace falta para tenerlos. */
export function estadoDeCanales(cliente) {
  return {
    telefono: {
      listo: Boolean(cliente?.twilio_number),
      falta: "Hace falta un número de teléfono asignado.",
    },
    whatsapp: {
      listo: false,
      falta: "WhatsApp todavía no está conectado.",
    },
  };
}

/**
 * Estado real de cada agente para una cuenta.
 *
 * El modo efectivo nunca es mejor que lo que permite el canal: si alguien dejó
 * "solo" guardado y luego se cayó el canal, aquí sale "avisar", que es lo que
 * de verdad va a pasar. Enseñar el ajuste guardado en vez del comportamiento
 * real es como tener el intermitente puesto con la bombilla fundida.
 */
export function evaluarAgentes({ cliente, ajustes }) {
  const canales = estadoDeCanales(cliente);

  return AGENTES.map((a) => {
    const canal = canales[a.canal] || { listo: false, falta: "Canal no disponible." };
    const guardado = ajustes?.[a.ajuste] === true ? "solo" : "avisar";
    const puedeEjecutar = canal.listo && !a.bloqueado;

    return {
      ...a,
      canalListo: canal.listo,
      motivoBloqueo: a.bloqueado || (canal.listo ? null : canal.falta),
      modoGuardado: guardado,
      /* Lo que va a pasar de verdad hoy. */
      modoEfectivo: puedeEjecutar ? guardado : "avisar",
      puedeEjecutar,
    };
  });
}
