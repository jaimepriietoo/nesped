/* =========================================================================
   Cómo quiere cada empresa que se comporte su IA.

   Un JSON por empresa (client_settings.ia_config) con lo que un cliente sin
   perfil técnico puede decidir: el tono, lo que puede y no puede hacer,
   cuándo pasa a una persona, qué pregunta y qué datos recoge, el horario,
   los mensajes de bienvenida y de fuera de horario, cuánta autonomía tiene
   y un texto libre con lo que quiera añadir.

   De aquí sale el prompt de sistema que usan las respuestas de WhatsApp y
   las sugerencias (promptDeEmpresa), y la previsualización que enseña el
   portal. Todo con valores por defecto sensatos: una empresa que no toca
   nada tiene una IA correcta, no una vacía.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { conRegistroIA } from "@/lib/server/ia";
import { iaDisponible } from "@/lib/server/estado-ia";
import { reservarGeneracionIA } from "@/lib/server/ai-budget";

export const TONOS = Object.freeze({
  cercano: { nombre: "Cercano", descripcion: "Tutea, frases cortas, natural. Como una recepción que conoce a la gente.", ejemplo: "¡Hola! Claro, dime qué necesitas y lo vemos." },
  profesional: { nombre: "Profesional", descripcion: "Trata de usted, claro y sin rodeos. Serio sin ser frío.", ejemplo: "Buenos días. Indíqueme qué necesita y le atiendo." },
  directo: { nombre: "Directo", descripcion: "Al grano. Pocas palabras, cero fórmulas.", ejemplo: "Dime qué necesitas." },
  calido: { nombre: "Cálido", descripcion: "Amable y paciente; se toma su tiempo con quien está nervioso.", ejemplo: "Hola, tranquilo, cuéntame qué ha pasado y lo solucionamos juntos." },
});

export const AUTONOMIA = Object.freeze({
  1: { nombre: "Sólo escucha", descripcion: "Recoge datos y avisa. No contesta por su cuenta." },
  2: { nombre: "Contesta lo básico", descripcion: "Responde horarios, dirección y preguntas frecuentes. Lo demás lo pasa." },
  3: { nombre: "Atiende y deriva", descripcion: "Atiende conversaciones completas y deriva cuando toca. Es la recomendada." },
  4: { nombre: "Resuelve", descripcion: "Resuelve lo que puede, agenda y sólo pasa a una persona lo que le has prohibido." },
});

export const POR_DEFECTO = Object.freeze({
  tono: "cercano",
  autonomia: 3,
  puede: ["Recoger nombre, teléfono y qué necesita", "Explicar qué hace la empresa", "Decir el horario y cómo contactar"],
  no_puede: ["Dar precios cerrados", "Prometer plazos", "Pedir datos bancarios o DNI"],
  derivar_cuando: ["Piden hablar con una persona", "Hay una queja o una reclamación", "No sabe la respuesta"],
  preguntas: ["¿Cómo te llamas?", "¿Qué necesitas exactamente?", "¿Cuándo te viene bien que te llamemos?"],
  datos: ["nombre", "teléfono", "necesidad"],
  horario: { dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "18:00", zona: "Europe/Madrid" },
  mensaje_bienvenida: "",
  mensaje_fuera_horario: "Ahora mismo están todos ocupados, pero en cuanto puedan le atiende una persona. Déjeme su nombre y su teléfono y le llaman en breve.",
  reglas_derivacion: [],
  instrucciones: "",
});

const LISTA = (v, max = 20, largo = 200) => (Array.isArray(v) ? v : []).map((x) => String(x || "").trim().slice(0, largo)).filter(Boolean).slice(0, max);
const HORA = /^\d{2}:\d{2}$/;

/** Limpia y completa una configuración que llega del portal. */
export function normalizarConfigIA(entrada = {}) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const horario = e.horario && typeof e.horario === "object" ? e.horario : {};
  return {
    tono: TONOS[e.tono] ? e.tono : POR_DEFECTO.tono,
    autonomia: AUTONOMIA[Number(e.autonomia)] ? Number(e.autonomia) : POR_DEFECTO.autonomia,
    puede: LISTA(e.puede ?? POR_DEFECTO.puede),
    no_puede: LISTA(e.no_puede ?? POR_DEFECTO.no_puede),
    derivar_cuando: LISTA(e.derivar_cuando ?? POR_DEFECTO.derivar_cuando),
    preguntas: LISTA(e.preguntas ?? POR_DEFECTO.preguntas, 10),
    datos: LISTA(e.datos ?? POR_DEFECTO.datos, 12, 40),
    horario: {
      dias: (Array.isArray(horario.dias) ? horario.dias : POR_DEFECTO.horario.dias).map(Number).filter((d) => d >= 0 && d <= 6),
      desde: HORA.test(horario.desde || "") ? horario.desde : POR_DEFECTO.horario.desde,
      hasta: HORA.test(horario.hasta || "") ? horario.hasta : POR_DEFECTO.horario.hasta,
      zona: "Europe/Madrid",
    },
    mensaje_bienvenida: String(e.mensaje_bienvenida ?? POR_DEFECTO.mensaje_bienvenida).trim().slice(0, 600),
    mensaje_fuera_horario: String(e.mensaje_fuera_horario ?? POR_DEFECTO.mensaje_fuera_horario).trim().slice(0, 600),
    reglas_derivacion: (Array.isArray(e.reglas_derivacion) ? e.reglas_derivacion : []).slice(0, 20)
      .map((r) => ({ si: String(r?.si || "").trim().slice(0, 200), departamento: String(r?.departamento || "").trim().slice(0, 40) }))
      .filter((r) => r.si && r.departamento),
    instrucciones: String(e.instrucciones ?? "").trim().slice(0, 4000),
  };
}

export async function configIA(clientId, supabase = getSupabase()) {
  if (!clientId) return normalizarConfigIA({});
  const { data } = await supabase.from("client_settings").select("ia_config").eq("client_id", clientId).maybeSingle();
  return normalizarConfigIA(data?.ia_config || {});
}

export async function guardarConfigIA(clientId, entrada, supabase = getSupabase()) {
  const config = normalizarConfigIA(entrada);
  const { error } = await supabase.from("client_settings").upsert({ client_id: clientId, ia_config: config }, { onConflict: "client_id" });
  if (error) throw new Error(error.message);
  return config;
}

/** ¿Estamos dentro del horario de la empresa? */
export function dentroDeHorario(config, ahora = new Date()) {
  const h = config?.horario || POR_DEFECTO.horario;
  const local = new Date(ahora.toLocaleString("en-US", { timeZone: h.zona || "Europe/Madrid" }));
  if (!(h.dias || []).includes(local.getDay())) return false;
  const minutos = local.getHours() * 60 + local.getMinutes();
  const [d1, d2] = String(h.desde).split(":").map(Number);
  const [h1, h2] = String(h.hasta).split(":").map(Number);
  return minutos >= d1 * 60 + d2 && minutos < h1 * 60 + h2;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** El prompt de sistema de la empresa: lo que la IA sabe que puede hacer. */
export function promptDeEmpresa(config, { empresa = "", sector = "", departamentos = [] } = {}) {
  const c = normalizarConfigIA(config);
  const tono = TONOS[c.tono];
  const lineas = [
    `Atiendes por escrito a quien contacta con ${empresa || "la empresa"}${sector ? ` (${sector})` : ""}. Eres una persona de recepción, no un robot; si te preguntan si eres una IA, lo dices con naturalidad.`,
    `TONO: ${tono.nombre.toLowerCase()}. ${tono.descripcion} Ejemplo: "${tono.ejemplo}"`,
    `AUTONOMÍA (${c.autonomia}/4): ${AUTONOMIA[c.autonomia].descripcion}`,
    c.puede.length ? `PUEDES: ${c.puede.join("; ")}.` : "",
    c.no_puede.length ? `NO PUEDES, NUNCA: ${c.no_puede.join("; ")}.` : "",
    c.derivar_cuando.length ? `PASA A UNA PERSONA CUANDO: ${c.derivar_cuando.join("; ")}. Al derivar, di que le llaman y recoge nombre y teléfono.` : "",
    c.preguntas.length ? `PREGUNTAS QUE HACES (una por mensaje, sin interrogar): ${c.preguntas.join(" · ")}` : "",
    c.datos.length ? `DATOS QUE RECOGES: ${c.datos.join(", ")}. Sin pedir nunca DNI, dirección completa ni datos de pago.` : "",
    `HORARIO: ${c.horario.dias.map((d) => DIAS[d]).join(", ")} de ${c.horario.desde} a ${c.horario.hasta}. Fuera de horario: "${c.mensaje_fuera_horario}"`,
    departamentos.length ? `DEPARTAMENTOS: ${departamentos.map((d) => `${d.nombre}${Array.isArray(d.areas) && d.areas.length ? ` [incluye ${d.areas.join(", ")}]` : ""}${d.descripcion ? ` (${d.descripcion})` : ""}`).join("; ")}.` : "",
    c.reglas_derivacion.length ? `REGLAS DE DERIVACIÓN: ${c.reglas_derivacion.map((r) => `si ${r.si} → ${r.departamento}`).join("; ")}.` : "",
    c.instrucciones ? `INSTRUCCIONES DE LA EMPRESA:\n${c.instrucciones}` : "",
    "Frases cortas. No inventes nada sobre la empresa que no esté aquí. Si no sabes algo, dilo y ofrece que le llamen.",
  ];
  return lineas.filter(Boolean).join("\n\n");
}

async function cliente() {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 0 });
}

/**
 * Cómo respondería la IA a un mensaje con esta configuración. Para la
 * pantalla de configuración. Si la IA no está, lo dice y devuelve el
 * prompt que se usaría, que es la parte que sí se puede enseñar.
 */
export async function previsualizar({ clientId, config, mensaje, empresa = "", sector = "", departamentos = [] }) {
  const prompt = promptDeEmpresa(config, { empresa, sector, departamentos });
  const ia = await iaDisponible(clientId);
  if (!ia.ok) return { respuesta: null, prompt, iaActiva: false, motivo: ia.motivo };
  await reservarGeneracionIA(clientId);
  const r = await conRegistroIA({ clientId, uso: "previsualizar-config", modelo: "gpt-4o-mini", promptVersion: "config-v1" }, async () =>
    (await cliente()).chat.completions.create({
      model: "gpt-4o-mini", temperature: 0.5, max_tokens: 300,
      messages: [{ role: "system", content: prompt }, { role: "user", content: String(mensaje || "").slice(0, 2000) }],
    }));
  return { respuesta: r.choices?.[0]?.message?.content?.trim() || "", prompt, iaActiva: true, motivo: null };
}

/** Un borrador de respuesta para un contacto, con el tono de la empresa. */
export async function borradorDeRespuesta({ clientId, lead, clasificacion, config }) {
  const ia = await iaDisponible(clientId);
  if (!ia.ok) return null;
  const prompt = promptDeEmpresa(config);
  const contexto = `Contacto: ${lead.nombre || "sin nombre"}. Necesita: ${lead.necesidad || lead.resumen || "no consta"}. Departamento: ${clasificacion?.departamento || "sin clasificar"}. Escribe la primera respuesta que le mandarías por WhatsApp, en 2-4 frases, sin firmar.`;
  await reservarGeneracionIA(clientId);
  const r = await conRegistroIA({ clientId, uso: "borrador-respuesta", modelo: "gpt-4o-mini", promptVersion: "borrador-v1" }, async () =>
    (await cliente()).chat.completions.create({
      model: "gpt-4o-mini", temperature: 0.6, max_tokens: 250,
      messages: [{ role: "system", content: prompt }, { role: "user", content: contexto }],
    }));
  return r.choices?.[0]?.message?.content?.trim() || null;
}
