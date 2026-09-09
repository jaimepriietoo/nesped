/**
 * Qué puede afirmar Nesped sobre un negocio, y con qué fundamento.
 *
 * Este fichero existe porque la tentación evidente al construir un producto
 * "con IA" es enseñar un panel lleno de predicciones antes de tener con qué
 * predecir. Un porcentaje de abandono inventado no es un adorno: es una cifra
 * sobre la que alguien va a decidir a quién llama.
 *
 * Así que cada módulo declara qué necesita y cuánto, y sólo devuelve un
 * resultado cuando lo tiene. Cuando no, dice exactamente qué falta. Un panel
 * que sabe lo que NO sabe da más confianza que uno que lo sabe todo.
 *
 * La otra razón es que el estado normal de un cliente nuevo es no tener nada.
 * Durante sus primeras semanas, esto —qué falta y qué desbloquea— ES el
 * producto. Enseñarle ceros no le dice nada; enseñarle el camino, sí.
 */

/* ── Fuentes de datos ──────────────────────────────────────────────────
   Lo que puede llegar a Nesped, medido por lo que hay de verdad en la base
   de datos. Nada de esto se declara conectado por tener una variable de
   entorno puesta: se mira si han llegado filas. */

/**
 * @typedef {Object} Fuente
 * @property {string} id
 * @property {string} nombre
 * @property {string} porQue     Para qué sirve tenerla, en una frase.
 * @property {string} comoActivar Qué tiene que hacer el cliente.
 */

/** Nivel mínimo de datos para que un módulo diga algo sin adivinar. */
const MINIMOS = {
  llamadas: 10,        // por debajo, cualquier porcentaje es ruido
  llamadasTendencia: 28, // dos semanas contra dos semanas
  leads: 1,
  cerrados: 10,        // para repartir motivos de pérdida en porcentajes
  equipo: 3,           // comparar comerciales con menos es señalar a alguien
};

/**
 * Mide qué fuentes tienen datos reales.
 *
 * Devuelve, por fuente, cuántos registros hay y desde cuándo. El "cuándo"
 * importa tanto como el "cuánto": treinta llamadas de hace cinco meses no
 * sirven para decir qué está pasando esta semana.
 */
export async function medirFuentes({ supabase, clientId }) {
  const [cliente, llamadas, leads, eventos, equipo] = await Promise.all([
    supabase
      .from("clients")
      .select("twilio_number,stripe_customer_id,billing_status")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("calls")
      .select("created_at,transcript,sentiment,call_outcome,objections,lead_captured,first_ai_response_ms,user_hung_up_early,duration_seconds")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("leads")
      .select("id,created_at,status,valor_estimado,last_contact_at,last_contacted_at,telefono,nombre,necesidad")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("lead_events")
      .select("created_at,type")
      .eq("client_id", clientId)
      .limit(1000),
    supabase
      .from("portal_users")
      .select("id,is_active")
      .eq("client_id", clientId),
  ]);

  const c = cliente.data || {};
  const filasLlamadas = llamadas.data || [];
  const filasLeads = leads.data || [];
  const filasEventos = eventos.data || [];
  const filasEquipo = (equipo.data || []).filter((u) => u.is_active !== false);

  return {
    cliente: c,
    llamadas: filasLlamadas,
    leads: filasLeads,
    eventos: filasEventos,
    equipo: filasEquipo,

    fuentes: [
      {
        id: "telefono",
        nombre: "Teléfono",
        estado: c.twilio_number ? "conectado" : "sin-conectar",
        detalle: c.twilio_number || null,
        porQue: "Es la puerta de entrada. Sin número, el agente no puede coger ninguna llamada.",
        comoActivar: "Asignamos un número y lo desviamos desde el tuyo actual. Lo hacemos nosotros.",
        registros: filasLlamadas.length,
      },
      {
        id: "llamadas",
        nombre: "Llamadas",
        estado: filasLlamadas.length >= MINIMOS.llamadas ? "conectado" : filasLlamadas.length > 0 ? "parcial" : "sin-conectar",
        detalle: filasLlamadas.length ? `${filasLlamadas.length} registradas` : null,
        porQue: "De cada llamada salen el motivo, las objeciones y el tono. Es la materia prima de todo lo demás.",
        comoActivar: "Se llenan solas en cuanto el número esté activo.",
        registros: filasLlamadas.length,
      },
      {
        id: "contactos",
        nombre: "Contactos",
        estado: filasLeads.length >= MINIMOS.leads ? "conectado" : "sin-conectar",
        detalle: filasLeads.length ? `${filasLeads.length} en cartera` : null,
        porQue: "Saber a quién hay que llamar y en qué punto está cada uno.",
        comoActivar: "El agente los crea al captar nombre y teléfono. También puedes importarlos.",
        registros: filasLeads.length,
      },
      {
        id: "facturacion",
        nombre: "Facturación",
        estado: c.stripe_customer_id ? "conectado" : "sin-conectar",
        detalle: c.billing_status || null,
        porQue: "Tu suscripción y tus facturas.",
        comoActivar: "Se conecta al contratar el plan.",
        registros: c.stripe_customer_id ? 1 : 0,
      },
      {
        id: "conversaciones",
        nombre: "Mensajería",
        estado: filasEventos.length ? "parcial" : "sin-conectar",
        detalle: filasEventos.length ? `${filasEventos.length} eventos` : null,
        porQue: "Ver el recorrido completo de un contacto, no sólo lo que pasó por teléfono.",
        comoActivar: "Pendiente de conectar WhatsApp. Todavía no está disponible.",
        registros: filasEventos.length,
        bloqueada: true,
      },
    ],
  };
}

/* ── Módulos de inteligencia ────────────────────────────────────────────
   Cada uno dice qué necesita, si lo tiene, y qué calcula. El que no puede
   calcular no desaparece del panel: se enseña con lo que le falta, porque
   saber qué desbloquearías es información útil. */

const horas = (ms) => ms / 36e5;
const dias = (ms) => ms / 864e5;

function desde(fecha) {
  const t = new Date(fecha).getTime();
  return Number.isFinite(t) ? Date.now() - t : Infinity;
}

/**
 * Contactos captados a los que nadie ha respondido.
 *
 * De todo lo que se puede medir aquí, esto es lo único que se puede afirmar
 * sin modelo: o se le ha llamado o no. El resto de la industria lo llama
 * "revenue leak"; aquí es simplemente una lista de gente esperando.
 *
 * No se pone precio a esa lista. Estimar el dinero perdido exigiría saber
 * cuánto vale un cliente y qué proporción cierra, y ninguna de las dos cosas
 * existe todavía. Un euro inventado en un panel de dirección es peor que un
 * hueco: alguien lo mete en una previsión.
 */
function sinSeguimiento({ leads }) {
  const UMBRAL_HORAS = 24;

  /* Una cartera vacía no está "al día": no existe. Sin este corte, una cuenta
     recién creada leía "nadie lleva más de 24 h esperando", que suena a que
     todo va bien cuando lo que pasa es que no ha entrado nada todavía. Decirle
     a alguien que va bien cuando no tiene datos es la forma más rápida de que
     deje de creerse el resto del panel. */
  if (!leads.length) {
    return {
      disponible: false,
      titulo: "Esperando respuesta",
      falta: "Todavía no hay ningún contacto en la cartera.",
      porQue: "En cuanto el agente capte el primero, esto empieza a vigilar quién lleva demasiado esperando.",
    };
  }

  const pendientes = leads
    .filter((l) => {
      const estado = String(l.status || "new").toLowerCase();
      if (["won", "lost"].includes(estado)) return false;
      const contacto = l.last_contact_at || l.last_contacted_at;
      if (contacto) return horas(desde(contacto)) > UMBRAL_HORAS * 7;
      return horas(desde(l.created_at)) > UMBRAL_HORAS;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const uno = pendientes.length === 1;

  return {
    disponible: true,
    valor: pendientes.length,
    unidad: uno ? "contacto" : "contactos",
    titulo: "Esperando respuesta",
    resumen: pendientes.length
      ? `${pendientes.length} ${uno ? "contacto lleva" : "contactos llevan"} más de ${UMBRAL_HORAS} h sin que nadie ${uno ? "le" : "les"} diga nada.`
      : `Nadie lleva más de ${UMBRAL_HORAS} h esperando. Al día.`,
    severidad: pendientes.length === 0 ? "bien" : pendientes.length > 5 ? "alta" : "media",
    metodo: `Contactos sin cerrar cuya alta supera las ${UMBRAL_HORAS} h sin ningún contacto registrado.`,
    items: pendientes.slice(0, 25).map((l) => ({
      id: l.id,
      nombre: l.nombre || "Sin nombre",
      telefono: l.telefono || "",
      necesidad: l.necesidad || "",
      esperando: Math.floor(horas(desde(l.created_at))),
    })),
  };
}

/**
 * Llamadas que entraron y se fueron sin dejar nada.
 *
 * Es la métrica que justifica el producto entero: alguien llamó, y no
 * sabemos quién era. Se cuenta sobre llamadas atendidas, no sobre el total,
 * porque una llamada que no llegó a sonar no es un fallo del agente.
 */
function llamadasSinCaptura({ llamadas }) {
  const atendidas = llamadas.filter((c) => (c.duration_seconds || 0) > 5);

  if (atendidas.length < MINIMOS.llamadas) {
    return {
      disponible: false,
      titulo: "Llamadas sin captar",
      falta: `Hacen falta ${MINIMOS.llamadas} llamadas atendidas. Van ${atendidas.length}.`,
      porQue: "Con menos, un porcentaje sube o baja veinte puntos por una sola llamada.",
    };
  }

  const perdidas = atendidas.filter((c) => c.lead_captured === false);
  const pct = Math.round((perdidas.length / atendidas.length) * 100);

  return {
    disponible: true,
    valor: pct,
    unidad: "%",
    titulo: "Llamadas sin captar",
    resumen: `De ${atendidas.length} llamadas atendidas, ${perdidas.length} colgaron sin dejar nombre ni teléfono.`,
    severidad: pct > 40 ? "alta" : pct > 20 ? "media" : "bien",
    metodo: "Llamadas de más de 5 segundos donde el agente no llegó a registrar un contacto.",
  };
}

/**
 * Cuánto tarda el agente en abrir la boca.
 *
 * Es lo primero que nota quien llama y lo primero que delata a una máquina.
 * Se usa la mediana y no la media: una sola llamada con un pico de red
 * arrastra la media y hace pensar que hay un problema donde no lo hay.
 */
function tiempoDeRespuesta({ llamadas }) {
  const tiempos = llamadas
    .map((c) => c.first_ai_response_ms)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (tiempos.length < MINIMOS.llamadas) {
    return {
      disponible: false,
      titulo: "Tiempo de respuesta",
      falta: `Hacen falta ${MINIMOS.llamadas} llamadas con medición. Van ${tiempos.length}.`,
      porQue: "Una mediana con cuatro datos no es una mediana.",
    };
  }

  const mediana = tiempos[Math.floor(tiempos.length / 2)];
  const p90 = tiempos[Math.floor(tiempos.length * 0.9)];

  return {
    disponible: true,
    valor: Math.round(mediana),
    unidad: "ms",
    titulo: "Tiempo de respuesta",
    resumen: `La mitad de las llamadas se contestan en menos de ${Math.round(mediana)} ms. Una de cada diez pasa de ${Math.round(p90)} ms.`,
    severidad: mediana > 1500 ? "alta" : mediana > 900 ? "media" : "bien",
    metodo: "Mediana del tiempo hasta la primera palabra del agente. Se usa mediana porque un pico de red arrastraría la media.",
  };
}

/**
 * Con qué se encuentra el agente, ordenado por frecuencia.
 *
 * Esto no predice nada: cuenta. Y contar lo que la gente pregunta y objeta
 * es probablemente lo más accionable que puede dar el sistema, porque se
 * traduce directamente en qué añadir al guion.
 */
function loQueDicen({ llamadas }) {
  const conObjeciones = llamadas.filter(
    (c) => Array.isArray(c.objections) && c.objections.length
  );

  if (conObjeciones.length < MINIMOS.llamadas) {
    return {
      disponible: false,
      titulo: "Lo que preguntan",
      falta: `Hacen falta ${MINIMOS.llamadas} llamadas con objeciones detectadas. Van ${conObjeciones.length}.`,
      porQue: "Ordenar por frecuencia con cuatro casos es ordenar por casualidad.",
    };
  }

  const cuenta = new Map();
  for (const c of conObjeciones) {
    for (const o of c.objections) {
      const clave = String(o || "").trim().toLowerCase();
      if (clave) cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
    }
  }

  const top = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([texto, n]) => ({
      texto,
      veces: n,
      porcentaje: Math.round((n / conObjeciones.length) * 100),
    }));

  return {
    disponible: true,
    valor: top[0]?.texto || "",
    titulo: "Lo que preguntan",
    resumen: top.length
      ? `Lo que más sale es "${top[0].texto}", en ${top[0].porcentaje}% de las llamadas con objeciones.`
      : "",
    severidad: "info",
    metodo: `Recuento sobre ${conObjeciones.length} llamadas con objeciones detectadas. Es frecuencia observada, no causa.`,
    items: top,
  };
}

/**
 * Módulos que aún no pueden existir, y por qué.
 *
 * Se declaran a propósito en vez de omitirlos. Que el panel enseñe lo que
 * podría saber —y qué haría falta— convierte un hueco en un camino. Y evita
 * que dentro de tres meses alguien los reimplemente sin saber que la razón
 * de que no estén es que faltan datos, no que falte código.
 */
function modulosPendientes({ llamadas, leads, equipo }) {
  const cerrados = leads.filter((l) =>
    ["won", "lost"].includes(String(l.status || "").toLowerCase())
  );
  const perdidos = cerrados.filter((l) => String(l.status).toLowerCase() === "lost");

  const antiguedad = llamadas.length
    ? Math.floor(dias(desde(llamadas[llamadas.length - 1].created_at)))
    : 0;

  return [
    {
      id: "dna",
      titulo: "Perfil de cliente",
      queDaria: "Ticket medio, cada cuánto compra y por qué canal responde mejor.",
      falta: "Nesped no registra compras todavía, sólo llamadas y contactos.",
      comoSeDesbloquea: "Conectando tu facturación o tu ERP, para saber qué compró cada cual y cuándo.",
    },
    {
      id: "churn",
      titulo: "Riesgo de fuga",
      queDaria: "Qué clientes se están enfriando antes de que se vayan.",
      falta: "Requiere ver a los mismos clientes a lo largo del tiempo. Hoy no hay historial de compras repetidas.",
      comoSeDesbloquea: "Con la facturación conectada y unos meses de recorrido.",
    },
    {
      id: "prevision",
      titulo: "Previsión de ingresos",
      queDaria: "Dónde vas a cerrar el mes y qué mover para llegar.",
      falta: `Necesita meses cerrados con ventas registradas. Hay ${cerrados.length} operaciones cerradas.`,
      comoSeDesbloquea: "Marcando las operaciones como ganadas o perdidas con su importe.",
    },
    {
      id: "autopsia",
      titulo: "Por qué se pierden",
      queDaria: "El reparto real de motivos de pérdida, con su peso.",
      falta: `Hacen falta ${MINIMOS.cerrados} operaciones perdidas para repartir porcentajes. Hay ${perdidos.length}.`,
      comoSeDesbloquea: "Anotando el motivo al marcar una operación como perdida.",
    },
    {
      id: "anomalias",
      titulo: "Detección de anomalías",
      queDaria: "Aviso cuando algo se sale de lo normal esta semana.",
      falta: `Hay que comparar contra un histórico. Se necesitan ${MINIMOS.llamadasTendencia} días de llamadas; hay ${antiguedad}.`,
      comoSeDesbloquea: "Solo con dejar pasar el tiempo con el número activo.",
    },
    {
      id: "equipo",
      titulo: "Patrones del equipo",
      queDaria: "Qué hacen distinto quienes más cierran.",
      falta: `Para comparar hacen falta al menos ${MINIMOS.equipo} personas con resultados. Hay ${equipo.length} en la cuenta.`,
      comoSeDesbloquea: "Dando de alta al equipo comercial y asignando contactos.",
    },
  ];
}

/**
 * Evalúa todo y devuelve el estado de inteligencia de una cuenta.
 */
export async function evaluarInteligencia({ supabase, clientId }) {
  const base = await medirFuentes({ supabase, clientId });

  const modulos = [
    sinSeguimiento(base),
    llamadasSinCaptura(base),
    tiempoDeRespuesta(base),
    loQueDicen(base),
  ];

  const activos = modulos.filter((m) => m.disponible);
  const conectadas = base.fuentes.filter((f) => f.estado === "conectado").length;

  return {
    fuentes: base.fuentes,
    /* Cuánto de la inteligencia está encendida. Es una fracción de módulos
       reales, no una barra de progreso decorativa: si dice 40% es que dos de
       cinco cosas se pueden calcular. */
    cobertura: {
      modulosActivos: activos.length,
      modulosTotales: modulos.length + modulosPendientes(base).length,
      fuentesConectadas: conectadas,
      fuentesTotales: base.fuentes.length,
    },
    modulos,
    pendientes: modulosPendientes(base),
    /* Titulares ordenados por lo que exige atención antes. Sólo salen de
       módulos con datos: aquí no entra nada estimado. */
    titulares: activos
      .filter((m) => m.severidad === "alta" || m.severidad === "media")
      .sort((a, b) => (a.severidad === "alta" ? -1 : 1))
      .map((m) => ({
        titulo: m.titulo,
        texto: m.resumen,
        severidad: m.severidad,
        metodo: m.metodo,
      })),
  };
}
