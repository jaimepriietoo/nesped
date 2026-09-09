/**
 * Los planes de Nesped, en un solo sitio.
 *
 * Antes esto vivía repartido: la lista de pantallas del portal decidía por su
 * cuenta qué se veía, los precios estaban en Stripe con otros nombres, y la
 * web enseñaba una tercera cosa. Tres sitios donde equivocarse.
 *
 * Aquí manda una idea: los planes no se diferencian por cuántas pantallas
 * abren, sino por hasta dónde llega Nesped.
 *
 *   Growth        Nesped ordena y automatiza tu negocio.
 *   Intelligence  Nesped entiende tu negocio y te dice qué hacer.
 *   Enterprise    Nesped trabaja por tu negocio.
 *
 * Esa progresión —organizar, entender, actuar— es la que decide en qué plan
 * cae cada función. Si al añadir algo hay que pensárselo mucho, casi siempre
 * es que la función está mal planteada, no que el plan esté mal puesto.
 *
 * Este fichero lo usan el servidor y el navegador, así que no puede importar
 * nada de servidor.
 */

/* ── Funciones ─────────────────────────────────────────────────────────
   El nombre describe qué hace, no en qué pantalla vive: una función puede
   aparecer en varios sitios y las pantallas se mueven. */

export const FUNCIONES = {
  // Organizar
  crm: "Contactos, fases y actividad",
  llamadas: "Registro de llamadas con transcripción",
  equipo: "Usuarios y permisos",
  exportar: "Exportación de datos",
  automatismosBasicos: "Recordatorios y cambios de estado",

  // Entender
  inteligencia: "Panel de inteligencia y prioridades",
  perfilCliente: "Perfil de cliente y patrones de compra",
  riesgoFuga: "Detección de clientes que se enfrían",
  fugaIngresos: "Dónde se está escapando el dinero",
  prevision: "Previsión de cierre del mes",
  anomalias: "Avisos cuando algo se sale de lo normal",
  autopsia: "Análisis de operaciones perdidas",
  recorrido: "Recorrido completo de cada contacto",
  siguienteAccion: "Qué hacer ahora y por qué",

  // Actuar
  copiloto: "Preguntarle a Nesped",
  agentes: "Agentes que ejecutan solos",
  adnVentas: "Patrones del equipo comercial",
  simulador: "Simulación de escenarios",
  integraciones: "Conectar más fuentes de datos",
};

/* ── Planes ────────────────────────────────────────────────────────── */

/**
 * Cada plan hereda el anterior. Se escribe así, con `hereda`, en vez de
 * repetir listas: cuando se añade una función a Growth aparece sola en los
 * tres, que es lo que se espera y lo que se olvida al copiar y pegar.
 */
export const PLANES = {
  growth: {
    id: "growth",
    nombre: "Growth",
    promesa: "Nesped ordena y automatiza tu negocio.",
    descripcion:
      "Todo lo que necesita un equipo comercial para no perder una llamada ni un contacto.",
    precio: 499,
    claveStripe: "nesped_growth",
    hereda: null,
    funciones: [
      "crm",
      "llamadas",
      "equipo",
      "exportar",
      "automatismosBasicos",
      /* El recorrido y la siguiente acción entran en el plan de entrada a
         propósito. Son lo que hace que la herramienta se use a diario, y un
         producto que no se usa a diario no se renueva, esté al precio que
         esté. */
      "recorrido",
      "siguienteAccion",
    ],
  },

  intelligence: {
    id: "intelligence",
    nombre: "Intelligence",
    promesa: "Nesped entiende tu negocio y te dice qué hacer.",
    descripcion:
      "Todo lo de Growth, y encima una capa que mira tus datos y señala dónde está el dinero.",
    precio: 999,
    claveStripe: "nesped_intelligence",
    hereda: "growth",
    recomendado: true,
    funciones: [
      "inteligencia",
      "perfilCliente",
      "riesgoFuga",
      "fugaIngresos",
      "prevision",
      "anomalias",
      "autopsia",
    ],
  },

  enterprise: {
    id: "enterprise",
    nombre: "Enterprise",
    promesa: "Nesped trabaja por tu negocio.",
    descripcion:
      "La diferencia no es cuánto ve, es cuánto hace. Aquí Nesped deja de recomendar y ejecuta.",
    precio: 1999,
    desde: true,
    claveStripe: "nesped_enterprise",
    hereda: "intelligence",
    /* No se contrata con tarjeta: hay que hablarlo. Un plan que da a un
       programa permiso para escribir a clientes en nombre de una empresa no
       se activa desde una pantalla de pago sin conocer el caso. */
    hablarConVentas: true,
    funciones: ["copiloto", "agentes", "adnVentas", "simulador", "integraciones"],
  },
};

export const ORDEN_PLANES = ["growth", "intelligence", "enterprise"];

/**
 * Nombres antiguos que siguen vivos en la base de datos.
 *
 * Las cuentas existentes tienen "starter" o "pro" escrito en su fila. Migrar
 * esos valores a mano y confiar en que no queda ninguno es la clase de cosa
 * que falla seis meses después con un cliente delante. Se traducen aquí, y
 * ambos nombres funcionan para siempre.
 */
const EQUIVALENCIAS = {
  starter: "growth",
  basic: "growth",
  pro: "intelligence",
  premium: "intelligence",
};

export const PLAN_POR_DEFECTO = "growth";

/** Normaliza lo que venga de la base de datos a un plan que existe. */
export function planDe(cliente) {
  const bruto = String(cliente?.plan || "").toLowerCase().trim();
  if (PLANES[bruto]) return bruto;
  if (EQUIVALENCIAS[bruto]) return EQUIVALENCIAS[bruto];
  return PLAN_POR_DEFECTO;
}

/** Todas las funciones de un plan, contando las que hereda. */
export function funcionesDe(planId) {
  const plan = PLANES[planId] || PLANES[PLAN_POR_DEFECTO];
  const propias = plan.funciones || [];
  return plan.hereda ? [...funcionesDe(plan.hereda), ...propias] : [...propias];
}

/** ¿Este plan incluye esta función? */
export function tieneFuncion(planId, funcion) {
  return funcionesDe(planDe({ plan: planId })).includes(funcion);
}

/** El plan más barato que incluye una función. Para decir dónde se consigue. */
export function planQueIncluye(funcion) {
  return ORDEN_PLANES.find((p) => funcionesDe(p).includes(funcion)) || null;
}

/** El siguiente plan hacia arriba, o null si ya está en el último. */
export function planSiguiente(planId) {
  const i = ORDEN_PLANES.indexOf(planDe({ plan: planId }));
  return i >= 0 && i < ORDEN_PLANES.length - 1 ? ORDEN_PLANES[i + 1] : null;
}

/**
 * Qué se le dice a alguien que se encuentra una función cerrada.
 *
 * Nunca "actualiza tu plan" a secas. Se dice qué hace esa función y qué se
 * gana con ella, porque quien la ve por primera vez no sabe lo que se está
 * perdiendo, y un candado sin explicación sólo produce fastidio.
 */
export const VALOR_BLOQUEADO = {
  inteligencia: {
    titulo: "Qué está pasando",
    gancho: "Nesped mira tus datos y te dice qué exige atención hoy, sin que tengas que buscarlo.",
  },
  perfilCliente: {
    titulo: "Perfil de cliente",
    gancho: "Cuánto vale cada cliente, cada cuánto vuelve y cuáles se están enfriando.",
  },
  riesgoFuga: {
    titulo: "Clientes que se enfrían",
    gancho: "Avisa cuando alguien que compraba con regularidad lleva demasiado sin volver, mientras todavía se puede recuperar.",
  },
  fugaIngresos: {
    titulo: "Dónde se escapa el dinero",
    gancho: "Contactos esperando respuesta, llamadas que colgaron sin dejar datos y operaciones paradas.",
  },
  prevision: {
    titulo: "Cómo va el mes",
    gancho: "Lo cerrado frente a tu objetivo, y cuánto falta, sin montar una hoja de cálculo.",
  },
  anomalias: {
    titulo: "Qué ha cambiado",
    gancho: "Aviso cuando algo se sale de lo normal esta semana comparado con tu propio histórico.",
  },
  autopsia: {
    titulo: "Por qué se pierden",
    gancho: "El reparto real de los motivos por los que no se cierran las operaciones.",
  },
  copiloto: {
    titulo: "Preguntarle a Nesped",
    gancho: "Preguntas en tu idioma sobre tu negocio y responde con tus datos, diciendo siempre de dónde sale cada cifra.",
  },
  agentes: {
    titulo: "Agentes que actúan",
    gancho: "Nesped deja de avisarte y hace el seguimiento por su cuenta, con el control que tú le des.",
  },
  adnVentas: {
    titulo: "Patrones del equipo",
    gancho: "Qué hacen distinto quienes más cierran, medido sobre tus propias operaciones.",
  },
  simulador: {
    titulo: "Simulación de escenarios",
    gancho: "Qué pasaría si respondierais más rápido o entraran más contactos, calculado sobre tu histórico.",
  },
  integraciones: {
    titulo: "Más fuentes de datos",
    gancho: "Conectar lo que ya usas para que Nesped vea el negocio entero, no sólo el teléfono.",
  },
};
