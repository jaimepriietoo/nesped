/* =========================================================================
   A qué departamento va cada contacto.

   Cada empresa tiene los suyos; si no ha configurado ninguno, valen los de
   serie. La IA lee lo que se habló con el contacto (resumen de la llamada,
   necesidad, mensajes) y elige uno, con un motivo y una confianza. Si la IA
   no está —sin clave, en pausa, con error— se clasifica por palabras clave
   de cada departamento, y se dice que fue así: `fuente` lleva "ia",
   "palabras" o "ninguna". Nunca se inventa una clasificación con cara de
   IA cuando no la hubo.

   Además del departamento, la IA saca señales que usan los automatismos:
   urgencia, enfado, oportunidad, importancia. Por palabras clave sólo
   salen las que se pueden ver a simple vista.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { conRegistroIA } from "@/lib/server/ia";
import { logErrorSeguro } from "@/lib/server/observability.mjs";
import { iaDisponible } from "@/lib/server/estado-ia";
import { reservarGeneracionIA } from "@/lib/server/ai-budget";

/** Los de serie. La descripción es lo que lee la IA para decidir. */
export const DEPARTAMENTOS_POR_DEFECTO = Object.freeze([
  { clave: "ventas", nombre: "Ventas", descripcion: "Quiere contratar, pide presupuesto, precio, oferta o información para comprar.", palabras_clave: ["presupuesto", "precio", "contratar", "oferta", "cuánto cuesta", "tarifa", "comprar", "alta"] },
  { clave: "soporte", nombre: "Soporte", descripcion: "Algo no funciona: avería, incidencia, problema técnico con un servicio ya contratado.", palabras_clave: ["no funciona", "avería", "averia", "incidencia", "problema", "se ha caído", "sin servicio", "no tengo", "fallo", "roto"] },
  { clave: "administracion", nombre: "Administración", descripcion: "Trámites, documentación, contratos, cambios de titular o de datos.", palabras_clave: ["contrato", "titular", "documentación", "trámite", "tramite", "baja", "cambio de datos"] },
  { clave: "facturacion", nombre: "Facturación", descripcion: "Facturas, cobros, pagos, recibos, domiciliaciones.", palabras_clave: ["factura", "cobro", "pago", "recibo", "me han cobrado", "domiciliación", "domiciliacion", "importe"] },
  { clave: "direccion", nombre: "Dirección", descripcion: "Quejas graves, reclamaciones formales, propuestas de colaboración, clientes grandes o asuntos que debe ver la dirección.", palabras_clave: ["reclamación", "reclamacion", "hoja de reclamaciones", "director", "gerente", "colaboración", "colaboracion", "denuncia"] },
  { clave: "instalaciones", nombre: "Instalaciones", descripcion: "Citas de instalación, visitas técnicas, obra, montaje.", palabras_clave: ["instalación", "instalacion", "instalar", "técnico", "tecnico", "visita", "montaje", "obra"] },
  { clave: "atencion", nombre: "Atención al cliente", descripcion: "Dudas generales de un cliente que ya lo es, consultas sobre su servicio.", palabras_clave: ["duda", "consulta", "información", "informacion", "horario", "cómo", "como"] },
  { clave: "marketing", nombre: "Marketing", descripcion: "Publicidad, colaboraciones, medios, redes sociales, eventos.", palabras_clave: ["publicidad", "redes", "patrocinio", "evento", "marketing", "prensa"] },
  { clave: "rrhh", nombre: "Recursos Humanos", descripcion: "Trabajo, empleo, currículum, prácticas.", palabras_clave: ["trabajo", "empleo", "currículum", "curriculum", "cv", "prácticas", "practicas", "vacante"] },
  { clave: "tecnico", nombre: "Técnico / operaciones", descripcion: "Cuestiones técnicas de operación, mantenimiento, proveedores técnicos.", palabras_clave: ["mantenimiento", "proveedor", "operaciones", "equipo", "material"] },
  { clave: "otro", nombre: "Otro", descripcion: "Nada de lo anterior.", palabras_clave: [] },
]);

export const CLAVE = /^[a-z0-9-]{1,40}$/;

/** Los departamentos activos de una empresa, o los de serie si no tiene. */
export async function departamentosDeEmpresa(clientId, supabase = getSupabase()) {
  const { data, error } = await supabase.from("departamentos")
    .select("id, clave, nombre, descripcion, palabras_clave, orden, activo")
    .eq("client_id", clientId).order("orden").order("nombre");
  if (error) throw new Error(error.message || "No se pudieron leer los departamentos");
  const propios = (data || []).filter((d) => d.activo);
  if (propios.length) return { lista: propios, deSerie: false };
  return { lista: DEPARTAMENTOS_POR_DEFECTO.map((d, i) => ({ ...d, id: null, orden: i, activo: true })), deSerie: true };
}

/** El texto que se analiza: lo que se sabe del contacto, sin más. */
export function textoDelLead(lead, extra = []) {
  return [lead?.necesidad, lead?.resumen, lead?.interes, lead?.notes, ...extra]
    .map((t) => String(t || "").trim()).filter(Boolean).join("\n").slice(0, 6000);
}

/** Clasificación por palabras clave. Devuelve siempre algo. */
export function clasificarPorPalabras(texto, departamentos) {
  const t = String(texto || "").toLowerCase();
  let mejor = null;
  for (const d of departamentos) {
    const aciertos = (d.palabras_clave || []).filter((p) => p && t.includes(String(p).toLowerCase()));
    if (aciertos.length && (!mejor || aciertos.length > mejor.aciertos.length)) mejor = { d, aciertos };
  }
  const senales = {
    urgente: /urgente|urgencia|ahora mismo|cuanto antes|hoy mismo|inmediat/.test(t),
    enfadado: /enfadad|indignad|vergüenza|verguenza|inaceptable|harto|harta|denuncia|reclamaci/.test(t),
    oportunidad: /presupuesto|contratar|varias|empresa|oficinas|flota|proyecto|grande/.test(t),
  };
  if (!mejor) {
    const otro = departamentos.find((d) => d.clave === "otro") || departamentos[departamentos.length - 1];
    return { departamento: otro?.clave || "otro", motivo: "Ninguna palabra clave encaja.", confianza: 0.2, fuente: "palabras", senales };
  }
  return {
    departamento: mejor.d.clave,
    motivo: `Palabras clave: ${mejor.aciertos.slice(0, 3).join(", ")}.`,
    confianza: Math.min(0.7, 0.4 + mejor.aciertos.length * 0.1),
    fuente: "palabras",
    senales,
  };
}

/** Clasificación con la IA. Lanza si falla; quien llama decide el respaldo. */
export async function clasificarConIA({ clientId, texto, departamentos, empresa = "" }) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 0 });
  const lista = departamentos.map((d) => `- ${d.clave}: ${d.nombre}. ${d.descripcion || ""}`).join("\n");
  const prompt = `Empresa: ${empresa || "(sin nombre)"}.
Departamentos posibles (usa exactamente una clave):
${lista}

Lo que se sabe del contacto:
"""
${texto}
"""

Devuelve JSON con: departamento (clave), motivo (una frase en español, sin datos personales), confianza (0 a 1),
urgente (bool), enfadado (bool), oportunidad (bool: puede ser una venta relevante), importante (bool: cliente grande, asunto que debe ver dirección).`;

  await reservarGeneracionIA(clientId);
  const r = await conRegistroIA({ clientId, uso: "clasificar-departamento", modelo: "gpt-4o-mini", promptVersion: "departamento-v1" }, () =>
    openai.chat.completions.create({
      model: "gpt-4o-mini", temperature: 0, max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Clasificas contactos de una empresa española por departamento. Sólo JSON válido." },
        { role: "user", content: prompt.slice(0, 12000) },
      ],
    }));
  let json = {};
  try { json = JSON.parse(r.choices?.[0]?.message?.content || "{}"); } catch { json = {}; }
  const clave = String(json.departamento || "").toLowerCase().trim();
  const valida = departamentos.some((d) => d.clave === clave);
  return {
    departamento: valida ? clave : (departamentos.find((d) => d.clave === "otro")?.clave || departamentos[0]?.clave || "otro"),
    motivo: String(json.motivo || "").slice(0, 300) || "Sin motivo.",
    confianza: Math.max(0, Math.min(1, Number(json.confianza) || 0.5)),
    fuente: "ia",
    senales: { urgente: Boolean(json.urgente), enfadado: Boolean(json.enfadado), oportunidad: Boolean(json.oportunidad), importante: Boolean(json.importante) },
  };
}

/**
 * Clasifica un contacto y lo guarda. Con IA si está; por palabras si no.
 * Devuelve la clasificación con su `fuente`.
 */
export async function clasificarLead({ clientId, leadId, textoExtra = [], supabase = getSupabase() }) {
  const { data: lead, error } = await supabase.from("leads")
    .select("id, client_id, nombre, necesidad, resumen, interes, notes, tags, status, departamento")
    .eq("id", leadId).eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("El contacto no existe");

  const [{ lista: departamentos }, { data: empresa }] = await Promise.all([
    departamentosDeEmpresa(clientId, supabase),
    supabase.from("clients").select("brand_name, name").eq("id", clientId).maybeSingle(),
  ]);
  const texto = textoDelLead(lead, textoExtra);
  if (!texto) {
    return { departamento: null, motivo: "No hay nada que leer todavía.", confianza: 0, fuente: "ninguna", senales: {} };
  }

  let resultado;
  const ia = await iaDisponible(clientId);
  if (ia.ok) {
    try {
      resultado = await clasificarConIA({ clientId, texto, departamentos, empresa: empresa?.brand_name || empresa?.name || "" });
    } catch (err) {
      logErrorSeguro("departments.ai_fallback", err);
      resultado = { ...clasificarPorPalabras(texto, departamentos), motivoRespaldo: String(err?.message || err).slice(0, 200) };
    }
  } else {
    resultado = { ...clasificarPorPalabras(texto, departamentos), motivoRespaldo: ia.motivo };
  }

  const { error: e2 } = await supabase.from("leads").update({
    departamento: resultado.departamento,
    departamento_motivo: `${resultado.motivo}${resultado.fuente === "palabras" ? " (por palabras clave)" : ""}`.slice(0, 300),
    departamento_confianza: resultado.confianza,
    clasificado_en: new Date().toISOString(),
    senales: { ...resultado.senales, fuente: resultado.fuente },
  }).eq("id", leadId).eq("client_id", clientId);
  if (e2) throw new Error(e2.message);

  return { ...resultado, anterior: lead.departamento || null, lead };
}
