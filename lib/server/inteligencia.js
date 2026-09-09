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
      .select("id,created_at,updated_at,status,valor_estimado,last_contact_at,last_contacted_at,telefono,nombre,necesidad,owner,lost_reason")
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
 * Cómo se pierden las operaciones.
 *
 * Este módulo no existía porque faltaba el dato, no el código: el portal
 * registraba QUE se perdía una operación pero nunca POR QUÉ. Se añadió la
 * columna y se pregunta el motivo al marcarla como perdida, con una lista
 * corta en vez de texto libre: veinte redacciones distintas de "caro" no se
 * pueden sumar.
 *
 * Cuenta motivos. No dice que el precio "cause" las pérdidas: dice en cuántas
 * se anotó el precio, que no es lo mismo y conviene no confundirlo cuando
 * alguien va a bajar tarifas por lo que lea aquí.
 */
function porQueSePierden({ leads }) {
  const perdidas = leads.filter((l) => String(l.status || "").toLowerCase() === "lost");
  const conMotivo = perdidas.filter((l) => l.lost_reason);

  if (conMotivo.length < MINIMOS.cerrados) {
    return {
      disponible: false,
      titulo: "Por qué se pierden",
      falta: `Hacen falta ${MINIMOS.cerrados} operaciones perdidas con motivo anotado. Van ${conMotivo.length}.`,
      porQue: "Repartir porcentajes con cuatro casos es repartir casualidad. El motivo se pregunta al marcar una operación como perdida.",
    };
  }

  const cuenta = new Map();
  for (const l of conMotivo) {
    cuenta.set(l.lost_reason, (cuenta.get(l.lost_reason) || 0) + 1);
  }

  const reparto = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([motivo, n]) => ({
      motivo,
      veces: n,
      porcentaje: Math.round((n / conMotivo.length) * 100),
    }));

  return {
    disponible: true,
    valor: reparto[0].porcentaje,
    unidad: "%",
    titulo: "Por qué se pierden",
    resumen: `En ${reparto[0].porcentaje}% de las ${conMotivo.length} operaciones perdidas se anotó "${reparto[0].motivo}".`,
    severidad: "info",
    metodo: `Recuento sobre ${conMotivo.length} operaciones perdidas con motivo. Es lo que se anotó, no una causa demostrada.`,
    items: reparto,
  };
}

/**
 * Dónde va el mes.
 *
 * Se compara lo ganado en el mes en curso contra el objetivo que el propio
 * cliente ha puesto en sus ajustes. No se extrapola a fin de mes: proyectar
 * con dos operaciones cerradas da una cifra que cambia de miles de euros
 * cada vez que entra una, y una previsión que baila así no sirve para
 * decidir nada. Se enseña lo que hay y cuánto falta.
 */
function comoVaElMes({ leads, objetivo }) {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();

  const ganadas = leads.filter(
    (l) =>
      String(l.status || "").toLowerCase() === "won" &&
      new Date(l.updated_at || l.created_at).getTime() >= inicioMes
  );

  const conImporte = ganadas.filter((l) => Number(l.valor_estimado) > 0);

  if (!conImporte.length) {
    return {
      disponible: false,
      titulo: "Cómo va el mes",
      falta: "Todavía no hay operaciones ganadas con importe este mes.",
      porQue: "Al marcar una operación como ganada y ponerle su valor, esto empieza a llevar la cuenta.",
    };
  }

  const sumado = conImporte.reduce((a, l) => a + Number(l.valor_estimado), 0);
  const meta = Number(objetivo) > 0 ? Number(objetivo) : 0;
  const pct = meta ? Math.round((sumado / meta) * 100) : null;

  return {
    disponible: true,
    valor: Math.round(sumado),
    unidad: "€",
    titulo: "Cómo va el mes",
    resumen: meta
      ? `${Math.round(sumado)} € cerrados este mes, ${pct}% del objetivo de ${meta} €.`
      : `${Math.round(sumado)} € cerrados este mes en ${conImporte.length} operaciones.`,
    severidad: meta && pct < 60 ? "media" : "bien",
    metodo:
      "Suma de los importes de las operaciones marcadas como ganadas este mes. No se proyecta a fin de mes a propósito: con pocas operaciones, una previsión baila miles de euros cada vez que entra una.",
  };
}

/**
 * Qué ha cambiado esta semana.
 *
 * Compara los últimos 7 días contra las 3 semanas anteriores. Se exige un mes
 * de recorrido porque comparar una semana contra otra semana en un negocio
 * pequeño es comparar dos ruidos: un puente o una feria mueven los números
 * más que cualquier cosa que se pueda arreglar.
 */
function queHaCambiado({ llamadas }) {
  if (llamadas.length < MINIMOS.llamadas) {
    return {
      disponible: false,
      titulo: "Qué ha cambiado",
      falta: `Hacen falta ${MINIMOS.llamadasTendencia} días de llamadas para tener con qué comparar.`,
      porQue: "Sin histórico, cualquier subida o bajada es ruido de la semana.",
    };
  }

  const ahora = Date.now();
  const semana = 7 * 864e5;
  const recientes = llamadas.filter((c) => ahora - new Date(c.created_at).getTime() <= semana);
  const previas = llamadas.filter((c) => {
    const d = ahora - new Date(c.created_at).getTime();
    return d > semana && d <= 4 * semana;
  });

  if (recientes.length < 5 || previas.length < 5) {
    return {
      disponible: false,
      titulo: "Qué ha cambiado",
      falta: `Hacen falta al menos 5 llamadas esta semana y 5 en las tres anteriores. Hay ${recientes.length} y ${previas.length}.`,
      porQue: "Con menos, un solo día flojo parece una caída.",
    };
  }

  const captura = (lista) => {
    const atendidas = lista.filter((c) => (c.duration_seconds || 0) > 5);
    if (!atendidas.length) return null;
    return atendidas.filter((c) => c.lead_captured).length / atendidas.length;
  };

  const ahoraPct = captura(recientes);
  const antesPct = captura(previas);
  if (ahoraPct === null || antesPct === null) {
    return {
      disponible: false,
      titulo: "Qué ha cambiado",
      falta: "No hay llamadas atendidas suficientes en alguno de los dos periodos.",
      porQue: "Comparar contra cero no dice nada.",
    };
  }

  const puntos = Math.round((ahoraPct - antesPct) * 100);
  const sube = puntos >= 0;

  return {
    disponible: true,
    valor: `${sube ? "+" : ""}${puntos}`,
    unidad: "pts",
    titulo: "Qué ha cambiado",
    resumen: `La captación de datos ${sube ? "ha subido" : "ha bajado"} ${Math.abs(puntos)} puntos esta semana frente a las tres anteriores.`,
    severidad: puntos <= -10 ? "alta" : puntos < 0 ? "media" : "bien",
    metodo: `Porcentaje de llamadas atendidas con datos captados: ${recientes.length} llamadas de los últimos 7 días contra ${previas.length} de las 3 semanas anteriores.`,
  };
}

/**
 * Cómo va cada persona del equipo.
 *
 * Se exige un mínimo de gente y de operaciones por persona porque comparar a
 * dos comerciales con tres operaciones cada uno no es medir: es señalar a
 * alguien con datos que no aguantan.
 */
function comoVaElEquipo({ leads, equipo }) {
  if (equipo.length < MINIMOS.equipo) {
    return {
      disponible: false,
      titulo: "Cómo va el equipo",
      falta: `Para comparar hacen falta al menos ${MINIMOS.equipo} personas. Hay ${equipo.length} en la cuenta.`,
      porQue: "Con menos, esto no compara: señala.",
    };
  }

  const porPersona = new Map();
  for (const l of leads) {
    const quien = l.owner || "";
    if (!quien) continue;
    const e = porPersona.get(quien) || { cerradas: 0, ganadas: 0 };
    const estado = String(l.status || "").toLowerCase();
    if (estado === "won" || estado === "lost") {
      e.cerradas += 1;
      if (estado === "won") e.ganadas += 1;
    }
    porPersona.set(quien, e);
  }

  const conVolumen = [...porPersona.entries()].filter(([, e]) => e.cerradas >= 5);

  if (conVolumen.length < MINIMOS.equipo) {
    return {
      disponible: false,
      titulo: "Cómo va el equipo",
      falta: `Hacen falta ${MINIMOS.equipo} personas con al menos 5 operaciones cerradas. Hay ${conVolumen.length}.`,
      porQue: "Una conversión calculada sobre tres operaciones cambia 33 puntos con una sola.",
    };
  }

  const filas = conVolumen
    .map(([quien, e]) => ({
      quien,
      cerradas: e.cerradas,
      conversion: Math.round((e.ganadas / e.cerradas) * 100),
    }))
    .sort((a, b) => b.conversion - a.conversion);

  return {
    disponible: true,
    valor: filas[0].conversion,
    unidad: "%",
    titulo: "Cómo va el equipo",
    resumen: `La mejor conversión es ${filas[0].conversion}% sobre ${filas[0].cerradas} operaciones cerradas.`,
    severidad: "info",
    metodo: "Operaciones ganadas sobre cerradas, por responsable, contando sólo a quien tenga 5 o más. Son diferencias observadas, no una explicación de por qué.",
    items: filas,
  };
}


/**
 * Agrupa las operaciones ganadas por teléfono para reconstruir el historial
 * de cada cliente final.
 *
 * Al principio di por imposibles el perfil de cliente y el riesgo de fuga
 * "porque Nesped no registra compras". Estaba mirándolo mal: una operación
 * marcada como ganada, con su importe y su fecha, ES una compra. Agrupando
 * por teléfono sale el historial sin necesidad de conectar ningún ERP.
 *
 * El teléfono como identidad tiene un límite que conviene saber: dos personas
 * de la misma casa que llamen desde el mismo fijo cuentan como una. Para un
 * negocio local eso suele ser justo lo que se quiere —la unidad que compra es
 * el hogar— pero no es una identidad de cliente en sentido estricto.
 */
function historialPorCliente(leads) {
  const porTelefono = new Map();

  for (const l of leads) {
    if (String(l.status || "").toLowerCase() !== "won") continue;
    const tel = String(l.telefono || "").replace(/[^\d+]/g, "");
    if (!tel) continue;
    const importe = Number(l.valor_estimado) || 0;
    const cuando = new Date(l.updated_at || l.created_at).getTime();
    if (!Number.isFinite(cuando)) continue;

    const ficha = porTelefono.get(tel) || { tel, nombre: l.nombre || "", compras: [] };
    ficha.compras.push({ importe, cuando });
    if (!ficha.nombre && l.nombre) ficha.nombre = l.nombre;
    porTelefono.set(tel, ficha);
  }

  for (const f of porTelefono.values()) {
    f.compras.sort((a, b) => a.cuando - b.cuando);
    f.total = f.compras.reduce((a, c) => a + c.importe, 0);
    f.ticket = f.compras.length ? f.total / f.compras.length : 0;
    f.ultima = f.compras[f.compras.length - 1].cuando;

    /* Cada cuánto compra, en días. Con una sola compra no hay frecuencia: no
       se rellena con un valor por defecto, se deja en null. */
    if (f.compras.length >= 2) {
      const huecos = f.compras.slice(1).map((c, i) => (c.cuando - f.compras[i].cuando) / 864e5);
      f.cadaDias = huecos.reduce((a, b) => a + b, 0) / huecos.length;
    } else {
      f.cadaDias = null;
    }
  }

  return [...porTelefono.values()];
}

/**
 * Quién repite y cuánto vale.
 */
function clientesRecurrentes({ leads }) {
  const fichas = historialPorCliente(leads);
  const repiten = fichas.filter((f) => f.compras.length >= 2);

  if (fichas.length < 5) {
    return {
      disponible: false,
      titulo: "Perfil de cliente",
      falta: `Hacen falta 5 clientes con al menos una compra. Van ${fichas.length}.`,
      porQue: "Se construye solo: cada operación que marques como ganada, con su importe, suma aquí.",
    };
  }

  const ticketMedio = fichas.reduce((a, f) => a + f.ticket, 0) / fichas.length;

  return {
    disponible: true,
    valor: Math.round(ticketMedio),
    unidad: "€",
    titulo: "Perfil de cliente",
    resumen: `Ticket medio de ${Math.round(ticketMedio)} € sobre ${fichas.length} clientes. ${repiten.length} ${repiten.length === 1 ? "ha repetido" : "han repetido"}.`,
    severidad: "info",
    metodo: "Operaciones ganadas agrupadas por teléfono. Dos personas del mismo fijo cuentan como un cliente, que para un negocio local suele ser lo correcto.",
    items: fichas
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((f) => ({
        nombre: f.nombre || f.tel,
        compras: f.compras.length,
        total: Math.round(f.total),
        cadaDias: f.cadaDias ? Math.round(f.cadaDias) : null,
      })),
  };
}

/**
 * Clientes que se están enfriando.
 *
 * No es un modelo: es una regla explicable. Si alguien compra cada 30 días de
 * media y lleva 75 sin aparecer, se ha ido enfriando. Se exige que tenga al
 * menos dos compras porque sin frecuencia propia no hay contra qué comparar,
 * y comparar contra la media de los demás mete en la lista a quien
 * simplemente compra poco por costumbre.
 */
function seEstanEnfriando({ leads }) {
  const fichas = historialPorCliente(leads).filter((f) => f.cadaDias);

  if (fichas.length < 5) {
    return {
      disponible: false,
      titulo: "Se están enfriando",
      falta: `Hacen falta 5 clientes con dos o más compras. Van ${fichas.length}.`,
      porQue: "Sin saber cada cuánto compra alguien, no se puede decir que lleve demasiado sin hacerlo.",
    };
  }

  const ahora = Date.now();
  const frios = fichas
    .map((f) => ({ ...f, sinComprar: (ahora - f.ultima) / 864e5 }))
    .filter((f) => f.sinComprar > f.cadaDias * 2)
    .sort((a, b) => b.total - a.total);

  return {
    disponible: true,
    valor: frios.length,
    unidad: frios.length === 1 ? "cliente" : "clientes",
    titulo: "Se están enfriando",
    resumen: frios.length
      ? `${frios.length} ${frios.length === 1 ? "cliente lleva" : "clientes llevan"} más del doble de su tiempo habitual sin comprar.`
      : "Ningún cliente lleva más del doble de su tiempo habitual sin comprar.",
    severidad: frios.length > 3 ? "media" : frios.length ? "media" : "bien",
    metodo: "Clientes con dos o más compras cuyo tiempo sin comprar supera el doble de su propia media. Es una regla, no una predicción: se puede comprobar a mano.",
    items: frios.slice(0, 10).map((f) => ({
      nombre: f.nombre || f.tel,
      cadaDias: Math.round(f.cadaDias),
      sinComprar: Math.round(f.sinComprar),
      total: Math.round(f.total),
    })),
  };
}

/**
 * Evalúa todo y devuelve el estado de inteligencia de una cuenta.
 */
export async function evaluarInteligencia({ supabase, clientId }) {
  const base = await medirFuentes({ supabase, clientId });

  /* El objetivo de facturación lo pone el propio cliente en sus ajustes: no
     se inventa una meta para poder enseñar un porcentaje. */
  const { data: ajustes } = await supabase
    .from("client_settings")
    .select("monthly_target_leads,default_deal_value")
    .eq("client_id", clientId)
    .maybeSingle();

  const objetivoMes =
    Number(ajustes?.monthly_target_leads || 0) * Number(ajustes?.default_deal_value || 0);

  const modulos = [
    sinSeguimiento(base),
    llamadasSinCaptura(base),
    tiempoDeRespuesta(base),
    loQueDicen(base),
    queHaCambiado(base),
    comoVaElMes({ ...base, objetivo: objetivoMes }),
    porQueSePierden(base),
    comoVaElEquipo(base),
    clientesRecurrentes(base),
    seEstanEnfriando(base),
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
      modulosTotales: modulos.length,
      fuentesConectadas: conectadas,
      fuentesTotales: base.fuentes.length,
    },
    modulos,
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
