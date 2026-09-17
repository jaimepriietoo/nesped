#!/usr/bin/env node
/**
 * Conecta el número de teléfono al agente de ElevenLabs y a una empresa.
 *
 *   node scripts/conectar-numero.mjs --empresa=fibergreen [--solo-comprobar]
 *
 * Lee de .env.local (o del entorno): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_PHONE_NUMBER, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, y la base.
 * Nunca imprime una credencial.
 *
 * Qué hace, en orden, y se para en el primer fallo:
 *   1. Comprueba que el número está en ESA cuenta de Twilio y tiene voz.
 *   2. Lo importa en ElevenLabs (o lo reutiliza si ya estaba) y lo asigna
 *      al agente. Al importarlo, ElevenLabs configura el número en Twilio
 *      para que las llamadas le lleguen.
 *   3. Guarda clients.twilio_number en la empresa indicada.
 *   4. Dice qué variable falta poner en Vercel (ELEVENLABS_PHONE_NUMBER_ID).
 */
import fs from "node:fs";

function cargarEnv() {
  try {
    for (const linea of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
}
cargarEnv();

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1] || "";
const empresa = arg("empresa");
const soloComprobar = process.argv.includes("--solo-comprobar");
const numero = String(process.env.TWILIO_PHONE_NUMBER || "").replace(/[^\d+]/g, "");
const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, ELEVENLABS_API_KEY: xi, ELEVENLABS_AGENT_ID: agente } = process.env;

function falta(...vars) { const f = vars.filter((v) => !process.env[v]); if (f.length) { console.error(`Faltan: ${f.join(", ")}`); process.exit(1); } }
falta("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID");
if (!numero.startsWith("+")) { console.error("TWILIO_PHONE_NUMBER tiene que ir en E.164 (+34…)"); process.exit(1); }

const twilio = async (ruta) => {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${ruta}`, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } });
  return r.json();
};
const eleven = async (ruta, init = {}) => {
  const r = await fetch(`https://api.elevenlabs.io/v1${ruta}`, { ...init, headers: { "xi-api-key": xi, "Content-Type": "application/json", ...(init.headers || {}) } });
  const texto = await r.text();
  let json; try { json = JSON.parse(texto); } catch { json = { raw: texto }; }
  if (!r.ok) throw new Error(`ElevenLabs ${ruta} → ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};

/* 1. El número, en Twilio. */
const lista = await twilio(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(numero)}`);
const linea = (lista.incoming_phone_numbers || [])[0];
if (!linea) { console.error(`El número ${numero} no está en la cuenta de Twilio ${sid.slice(0, 6)}…. ¿Es la cuenta correcta?`); process.exit(1); }
if (!linea.capabilities?.voice) { console.error(`El número ${numero} no tiene capacidad de voz.`); process.exit(1); }
console.log(`✔ Twilio: ${numero} está en la cuenta (${linea.sid.slice(0, 6)}…), con voz. Hoy apunta a: ${linea.voice_url || "(nada)"}`);

/* 2. ElevenLabs. */
const existentes = await eleven("/convai/phone-numbers");
const ya = (Array.isArray(existentes) ? existentes : existentes.phone_numbers || []).find((p) => String(p.phone_number || "").replace(/[^\d+]/g, "") === numero);
let phoneNumberId = ya?.phone_number_id || null;
if (ya) console.log(`✔ ElevenLabs ya tiene el número (${phoneNumberId}), asignado a: ${ya.assigned_agent?.agent_id || ya.assigned_agent?.agent_name || "(nadie)"}`);
if (soloComprobar) { console.log("Sólo comprobar: no se cambia nada."); process.exit(0); }

if (!ya) {
  const creado = await eleven("/convai/phone-numbers", { method: "POST", body: JSON.stringify({ phone_number: numero, label: `Nesped ${numero}`, sid, token, provider: "twilio", agent_id: agente }) });
  phoneNumberId = creado.phone_number_id;
  console.log(`✔ ElevenLabs: número importado y asignado al agente (${phoneNumberId})`);
} else if (ya.assigned_agent?.agent_id !== agente) {
  await eleven(`/convai/phone-numbers/${phoneNumberId}`, { method: "PATCH", body: JSON.stringify({ agent_id: agente }) });
  console.log(`✔ ElevenLabs: número asignado al agente ${agente}`);
}

const despues = await twilio(`/IncomingPhoneNumbers/${linea.sid}.json`);
console.log(`✔ Twilio ahora manda las llamadas a: ${despues.voice_url || "(nada: revisar en ElevenLabs)"}`);

/* 3. La empresa. */
if (empresa) {
  const { createClient } = await import("@supabase/supabase-js");
  falta("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: otras } = await supabase.from("clients").select("id").eq("twilio_number", numero).neq("id", empresa);
  for (const o of otras || []) { await supabase.from("clients").update({ twilio_number: null }).eq("id", o.id); console.log(`  · quitado de ${o.id}`); }
  const { data, error } = await supabase.from("clients").update({ twilio_number: numero }).eq("id", empresa).select("id").maybeSingle();
  if (error || !data) { console.error(`No se pudo guardar en la empresa ${empresa}: ${error?.message || "no existe"}`); process.exit(1); }
  console.log(`✔ Base: ${numero} es ahora el número de la empresa "${empresa}"`);
} else {
  console.log("· Sin --empresa: no se ha tocado ninguna empresa. Añade --empresa=<id> para asignarlo.");
}

/* 4. Lo que queda a mano. */
console.log(`
Queda por poner en Vercel (y en .env.local):
  ELEVENLABS_PHONE_NUMBER_ID=${phoneNumberId}
  TWILIO_PHONE_NUMBER=${numero}
  TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN de la cuenta que tiene el número (si aún son los de otra)
Después: redesplegar y hacer una llamada de prueba.`);
