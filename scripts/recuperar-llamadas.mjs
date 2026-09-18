#!/usr/bin/env node
/**
 * Recupera de ElevenLabs las llamadas que no llegaron por el webhook.
 *
 *   node --import ./tests/alias.mjs scripts/recuperar-llamadas.mjs [--desde=2026-09-17] [--empresa=nesped] [--solo-comprobar]
 *
 * Con --empresa, las llamadas se guardan en esa empresa aunque en su momento
 * el número fuera de otra: para cuando el número ha cambiado de dueño y las
 * llamadas anteriores tienen que verse en la cuenta nueva.
 *
 * Pide a ElevenLabs las conversaciones del agente desde una fecha, mira
 * cuáles no están en `calls` (por call_sid = id de conversación) y las pasa
 * por el mismo camino que el webhook (persistElevenLabsCall): llamada,
 * contacto, consumo, grabación, clasificación y automatismos. Lo que ya
 * estaba se deja en paz: reclamar_webhook lo ignora.
 *
 * Para cuando el webhook post-call no llegó —una URL con redirección, un
 * cortafuegos, un despliegue caído— y hay que ponerse al día.
 */
import fs from "node:fs";

for (const linea of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1] || "";
const desde = new Date(arg("desde") || Date.now() - 3 * 864e5);
const soloComprobar = process.argv.includes("--solo-comprobar");
const empresaForzada = arg("empresa");
const { ELEVENLABS_API_KEY: xi, ELEVENLABS_AGENT_ID: agente } = process.env;
if (!xi || !agente) { console.error("Faltan ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID"); process.exit(1); }

const { getSupabase } = await import("@/lib/supabase");
const { persistElevenLabsCall } = await import("@/lib/server/elevenlabs");
const supabase = getSupabase();

const eleven = async (ruta) => {
  const r = await fetch(`https://api.elevenlabs.io/v1${ruta}`, { headers: { "xi-api-key": xi } });
  if (!r.ok) throw new Error(`ElevenLabs ${ruta} → ${r.status}`);
  return r.json();
};

const lista = await eleven(`/convai/conversations?agent_id=${agente}&page_size=100`);
const recientes = (lista.conversations || []).filter((c) => c.start_time_unix_secs * 1000 >= desde.getTime() && c.status === "done");
console.log(`ElevenLabs: ${recientes.length} conversaciones terminadas desde ${desde.toISOString().slice(0, 10)}`);

const ids = recientes.map((c) => c.conversation_id);
const { data: existentes } = await supabase.from("calls").select("call_sid").in("call_sid", ids);
const ya = new Set((existentes || []).map((r) => r.call_sid));
const faltan = recientes.filter((c) => !ya.has(c.conversation_id));
console.log(`En la base: ${ya.size}. Faltan: ${faltan.length}.`);
if (soloComprobar || !faltan.length) process.exit(0);

let ok = 0, mal = 0;
for (const c of faltan) {
  try {
    const conv = await eleven(`/convai/conversations/${c.conversation_id}`);
    if (empresaForzada) {
      conv.conversation_initiation_client_data = conv.conversation_initiation_client_data || {};
      conv.conversation_initiation_client_data.dynamic_variables = { ...(conv.conversation_initiation_client_data.dynamic_variables || {}), client_id: empresaForzada };
    }
    const r = await persistElevenLabsCall({ payload: { type: "post_call_transcription", event_timestamp: c.start_time_unix_secs, data: conv } });
    ok += 1;
    console.log(`✔ ${c.conversation_id} (${c.call_duration_secs}s) → ${r.duplicated ? "ya estaba" : `empresa ${r.clientId}, contacto ${r.leadId || "-"}`}`);
  } catch (err) {
    mal += 1;
    console.error(`✖ ${c.conversation_id}: ${err?.message || err}`);
  }
}
console.log(`Recuperadas: ${ok}. Fallidas: ${mal}. La cola hará el resto (grabación, clasificación, avisos) en la siguiente pasada.`);
