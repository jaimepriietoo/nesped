#!/usr/bin/env node
/**
 * Da de alta en el agente de ElevenLabs la herramienta `anotar_instruccion`
 * (modo Ruperta). Idempotente: si ya existe, no toca nada. No cambia el
 * prompt del agente: las instrucciones de Ruperta viajan dentro de
 * {{contexto_empresa}}, que el prompt ya usa.
 *
 *   node scripts/configurar-ruperta.mjs [--quitar]
 */
import fs from "node:fs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const { ELEVENLABS_API_KEY: xi, ELEVENLABS_AGENT_ID: agente } = process.env;
if (!xi || !agente) { console.error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_AGENT_ID"); process.exit(2); }
const base = String(process.env.NEXT_PUBLIC_APP_URL || "https://www.nesped.com").replace(/\/+$/, "");
const NOMBRE = "anotar_instruccion";
const quitar = process.argv.includes("--quitar");

const api = async (ruta, opciones = {}) => {
  const r = await fetch(`https://api.elevenlabs.io/v1${ruta}`, { ...opciones, headers: { "xi-api-key": xi, "Content-Type": "application/json", ...(opciones.headers || {}) } });
  if (!r.ok) throw new Error(`${opciones.method || "GET"} ${ruta}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

const a = await api(`/convai/agents/${agente}`);
const prompt = a.conversation_config?.agent?.prompt || {};
const tools = Array.isArray(prompt.tools) ? prompt.tools : [];
const existente = tools.find((t) => t.name === NOMBRE);
const plantilla = tools.find((t) => t.type === "webhook" && t.api_schema?.request_headers);
if (!plantilla) { console.error("No hay ninguna herramienta webhook de la que copiar la cabecera del token interno."); process.exit(1); }

if (quitar) {
  if (!existente) { console.log("No estaba."); process.exit(0); }
  await api(`/convai/agents/${agente}`, { method: "PATCH", body: JSON.stringify({ conversation_config: { agent: { prompt: { tools: tools.filter((t) => t.name !== NOMBRE) } } } }) });
  console.log("Quitada."); process.exit(0);
}
if (existente) { console.log(`${NOMBRE} ya está en el agente ${a.name}.`); process.exit(0); }

const campo = (descripcion, extra = {}) => ({
  type: "string", description: descripcion, enum: null, is_system_provided: false, dynamic_variable: "",
  allowed_values: null, allowed_values_dynamic_variable: "", constant_value: "", is_omitted: false, ...extra,
});
const nueva = {
  type: "webhook",
  name: NOMBRE,
  description: "Anota una instrucción dictada por una persona autorizada en modo Ruperta. Úsala SÓLO cuando quien llama haya dicho el nombre de activación, te haya dado el PIN y haya confirmado la instrucción. Lee en voz alta el campo `mensaje` de la respuesta tal cual.",
  response_timeout_secs: 10,
  disable_interruptions: false,
  interruption_mode: "allow",
  force_pre_tool_speech: false,
  pre_tool_speech: "off",
  assignments: [],
  tool_call_sound: null,
  tool_call_sound_behavior: "auto",
  tool_error_handling_mode: "hide",
  dynamic_variables: { dynamic_variable_placeholders: {} },
  execution_mode: "immediate",
  api_schema: {
    request_headers: plantilla.api_schema.request_headers,
    kind: "webhook",
    url: `${base}/api/voice/elevenlabs/instruccion`,
    method: "POST",
    path_params_schema: {},
    query_params_schema: null,
    request_body_schema: {
      description: "", dynamic_variable: "", is_omitted: false, type: "object",
      required: ["clientId", "callerId", "pin", "texto"],
      properties: {
        clientId: campo("", { dynamic_variable: "client_id" }),
        callerId: campo("", { dynamic_variable: "system__caller_id" }),
        conversationId: campo("", { dynamic_variable: "system__conversation_id" }),
        pin: campo("El PIN de instrucciones que ha dicho quien llama, sólo cifras."),
        texto: campo("La instrucción completa, con las palabras de quien llama, en una o dos frases. Incluye a quién afecta y qué hay que decir."),
        vigente_hasta: campo("Si quien llama dijo hasta cuándo aplica, la fecha y hora en formato ISO 8601 (zona Europe/Madrid). Si no lo dijo, vacío."),
      },
    },
  },
};
await api(`/convai/agents/${agente}`, { method: "PATCH", body: JSON.stringify({ conversation_config: { agent: { prompt: { tools: [...tools, nueva] } } } }) });
const b = await api(`/convai/agents/${agente}`);
const ok = (b.conversation_config?.agent?.prompt?.tools || []).some((t) => t.name === NOMBRE);
console.log(ok ? `${NOMBRE} añadida al agente ${b.name}.` : "No aparece tras el PATCH; revisa en el panel.");
process.exit(ok ? 0 : 1);
