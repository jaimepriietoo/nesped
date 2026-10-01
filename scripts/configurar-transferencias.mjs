#!/usr/bin/env node
/**
 * Da de alta en el agente de ElevenLabs la herramienta de sistema
 * `transfer_to_number`: pasar la llamada a una persona del departamento.
 *
 *   node scripts/configurar-transferencias.mjs              añade o actualiza
 *   node scripts/configurar-transferencias.mjs --quitar     la quita
 *   node scripts/configurar-transferencias.mjs --ver        sólo enseña cómo está
 *
 * El agente es el mismo para todas las empresas, así que no conoce
 * departamentos sino tres huecos: «pasar al 1, al 2, al 3». El número de cada
 * hueco lo manda Nesped en cada llamada (variables transferir_N_telefono, ver
 * lib/server/transferencias.js). Un hueco vacío no se usa.
 *
 * Transferencia «conference»: ElevenLabs llama al trabajador, le lee una frase
 * con quién llama y para qué, conecta al cliente y se sale. Es la única que
 * admite ese mensaje para el trabajador con la integración nativa de Twilio.
 *
 * No toca el prompt ni las demás herramientas. No imprime cabeceras ni
 * secretos.
 */
import fs from "node:fs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const { ELEVENLABS_API_KEY: xi, ELEVENLABS_AGENT_ID: agente } = process.env;
if (!xi || !agente) { console.error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_AGENT_ID"); process.exit(2); }

const NOMBRE = "transfer_to_number";
const HUECOS = 3;
const quitar = process.argv.includes("--quitar");
const soloVer = process.argv.includes("--ver");

const api = async (ruta, opciones = {}) => {
  const r = await fetch(`https://api.elevenlabs.io/v1${ruta}`, { ...opciones, headers: { "xi-api-key": xi, "Content-Type": "application/json", ...(opciones.headers || {}) } });
  if (!r.ok) throw new Error(`${opciones.method || "GET"} ${ruta}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

/** Las reglas del agente, una por hueco. */
function reglas() {
  return Array.from({ length: HUECOS }, (_, i) => {
    const n = i + 1;
    return {
      transfer_destination: { type: "phone", phone_number: `{{transferir_${n}_telefono}}` },
      condition: `El cliente ha dicho claramente que sí quiere que le pasen con el departamento ${n} de la lista «PASAR LA LLAMADA A UNA PERSONA» (el departamento {{transferir_${n}_nombre}}). Nunca si ese departamento no está en la lista.`,
      transfer_type: "conference",
    };
  });
}

/** Valores por defecto de las variables: sin ellos, la vista previa del panel no arranca. */
function marcadores() {
  return Object.fromEntries(Array.from({ length: HUECOS }, (_, i) => [
    [`transferir_${i + 1}_nombre`, ""],
    [`transferir_${i + 1}_telefono`, ""],
  ]).flat());
}

const a = await api(`/convai/agents/${agente}`);
const agent = a.conversation_config?.agent || {};
const tools = Array.isArray(agent.prompt?.tools) ? agent.prompt.tools : [];
const existente = tools.find((t) => t.name === NOMBRE);
const placeholders = agent.dynamic_variables?.dynamic_variable_placeholders || {};

if (soloVer) {
  console.log(existente
    ? `${NOMBRE} está en ${a.name} con ${existente.params?.transfers?.length || 0} reglas (${(existente.params?.transfers || []).map((t) => t.transfer_type).join(", ")}).`
    : `${NOMBRE} no está en ${a.name}.`);
  process.exit(0);
}

const sinLaNuestra = tools.filter((t) => t.name !== NOMBRE);
const placeholdersSin = Object.fromEntries(Object.entries(placeholders).filter(([k]) => !/^transferir_\d+_(nombre|telefono)$/.test(k)));

if (quitar) {
  if (!existente) { console.log("No estaba."); process.exit(0); }
  await api(`/convai/agents/${agente}`, { method: "PATCH", body: JSON.stringify({ conversation_config: { agent: {
    prompt: { tools: sinLaNuestra },
    dynamic_variables: { dynamic_variable_placeholders: placeholdersSin },
  } } }) });
  console.log("Quitada. La asistente ya no puede pasar llamadas.");
  process.exit(0);
}

const nueva = {
  type: "system",
  name: NOMBRE,
  description: "Pasa la llamada a una persona del departamento que el cliente ha aceptado. Úsala sólo después de un sí claro y sólo con departamentos de la lista «PASAR LA LLAMADA A UNA PERSONA».",
  params: { system_tool_type: NOMBRE, transfers: reglas() },
};

await api(`/convai/agents/${agente}`, { method: "PATCH", body: JSON.stringify({ conversation_config: { agent: {
  prompt: { tools: [...sinLaNuestra, nueva] },
  dynamic_variables: { dynamic_variable_placeholders: { ...placeholdersSin, ...marcadores() } },
} } }) });

const b = await api(`/convai/agents/${agente}`);
const quedo = (b.conversation_config?.agent?.prompt?.tools || []).find((t) => t.name === NOMBRE);
const ok = quedo?.params?.transfers?.length === HUECOS;
console.log(ok
  ? `${NOMBRE} ${existente ? "actualizada" : "añadida"} en ${b.name}: ${HUECOS} reglas, tipo conference. Herramientas: ${(b.conversation_config.agent.prompt.tools || []).map((t) => t.name).join(", ")}.`
  : "No aparece como se esperaba tras el PATCH; revisa en el panel.");
process.exit(ok ? 0 : 1);
