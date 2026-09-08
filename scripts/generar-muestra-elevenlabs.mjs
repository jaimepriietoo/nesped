/**
 * Genera la llamada de muestra de la portada con ElevenLabs.
 *
 *   node scripts/generar-muestra-elevenlabs.mjs            genera el audio
 *   node scripts/generar-muestra-elevenlabs.mjs --listar    lista las voces
 *
 * Diferencia con generar-muestra-voz.mjs: allí dos modelos improvisaban la
 * conversación y salía distinta cada vez. Aquí el guion está fijado y sólo se
 * sintetiza. Para una muestra comercial eso es lo que queremos: las palabras
 * ya están validadas y lo único que buscamos es el mejor timbre posible.
 *
 * El ritmo (recortes, pausas, huecos entre turnos) es el mismo módulo que usa
 * el otro generador: lo que hace que suene a conversación no es el motor de
 * voz, son los tiempos.
 */
import fs from "node:fs";
import path from "node:path";
import {
  recortarSilencio, acortarPausasInternas, huecoEntreTurnos,
  silencio, envolverWav, leerEnv, medirParones,
} from "./lib/audio-llamada.mjs";

const env = leerEnv(fs);
const CLAVE = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || "";
const FRECUENCIA = 24000;
const SALIDA = path.join("public", "muestra-llamada.wav");
const API = "https://api.elevenlabs.io/v1";

/* eleven_multilingual_v2 es el que mejor español da hoy. turbo y flash están
   pensados para tiempo real, y aquí no hay ninguna prisa: es un fichero que
   se genera una vez, así que cogemos el de más calidad. */
const MODELO = process.env.MODELO_VOZ || "eleven_multilingual_v2";

/* Se acepta nombre o ID. El nombre se resuelve contra la cuenta, que es lo
   práctico: los IDs no hay quien se los aprenda. */
const VOCES = {
  agente: process.env.VOZ_AGENTE || env.ELEVENLABS_VOZ_AGENTE || "",
  cliente: process.env.VOZ_CLIENTE || env.ELEVENLABS_VOZ_CLIENTE || "",
};

/**
 * El guion.
 *
 * `texto` es lo que se lee en la portada; `dicho` lo que se sintetiza, cuando
 * hacen falta distintos. El teléfono es el caso claro: en pantalla queda mejor
 * "602 297 770", pero si le pasas eso al sintetizador lo lee como un número
 * entero de nueve cifras, que no es como lo dice nadie por teléfono.
 */
const GUION = [
  { quien: "agente",  texto: "Instalaciones Vega, hola." },
  { quien: "cliente", texto: "Sí, mira, es que quería pedir un presupuesto de aerotermia para mi chalet y voy un poco justa de tiempo." },
  { quien: "agente",  texto: "Perfecto, ¿cómo te llamas?" },
  { quien: "cliente", texto: "Marta." },
  { quien: "agente",  texto: "Marta, ¿me das un teléfono de contacto para poder seguir contigo?" },
  { quien: "cliente", texto: "Sí, es el seis cero dos, dos nueve siete, siete siete cero." },
  { quien: "agente",  texto: "Vale, 602 297 770. Te llaman hoy.", dicho: "Vale, seis cero dos, dos nueve siete, siete siete cero. Te llaman hoy." },
  { quien: "cliente", texto: "Perfecto, quedo atenta, gracias." },
  { quien: "agente",  texto: "Hasta luego, Marta, gracias." },
];

/**
 * Ajustes de voz.
 *
 * stability baja deja al modelo variar la entonación entre frases; alta lo
 * deja plano, que es exactamente lo que sonaba a tostadora. El agente va algo
 * más estable porque es quien atiende y no conviene que suene teatral; quien
 * llama tiene más libertad porque está explicando algo suyo.
 */
const AJUSTES = {
  agente:  { stability: 0.45, similarity_boost: 0.75, style: 0.30, use_speaker_boost: true },
  cliente: { stability: 0.35, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
};

function exigirClave() {
  if (CLAVE) return;
  console.error(
    "Falta ELEVENLABS_API_KEY.\n\n" +
    "Añádela a .env.local (no la pegues en el chat):\n" +
    '  echo \'ELEVENLABS_API_KEY="tu-clave"\' >> .env.local\n'
  );
  process.exit(1);
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: { "xi-api-key": CLAVE, ...(opciones.headers || {}) },
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} en ${ruta}\n${detalle.slice(0, 400)}`);
  }
  return r;
}

async function listarVoces() {
  const r = await pedir("/voices");
  const { voices } = await r.json();
  return voices || [];
}

/**
 * PCM a 24 kHz es lo que encaja con el resto del montaje sin conversiones.
 * En los planes bajos ese formato no está disponible, así que se cae a 16 kHz
 * y se interpola. Para voz la diferencia audible es mínima y es preferible a
 * que el script falle sin más.
 */
async function sintetizar(voiceId, texto, ajustes, anterior, siguiente) {
  const cuerpo = {
    text: texto,
    model_id: MODELO,
    language_code: "es",
    voice_settings: ajustes,
    // Contexto para que la entonación enlace entre turnos: sin esto cada
    // frase se genera como si fuera la primera y se nota el corte.
    ...(anterior ? { previous_text: anterior } : {}),
    ...(siguiente ? { next_text: siguiente } : {}),
  };

  for (const formato of ["pcm_24000", "pcm_16000"]) {
    try {
      const r = await pedir(`/text-to-speech/${voiceId}?output_format=${formato}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const pcm = Buffer.from(await r.arrayBuffer());
      return formato === "pcm_24000" ? pcm : remuestrear(pcm, 16000, FRECUENCIA);
    } catch (e) {
      if (formato === "pcm_16000") throw e;
      console.log(`   (pcm_24000 no disponible en este plan, uso 16 kHz)`);
    }
  }
}

function remuestrear(pcm, de, a) {
  const n = pcm.length / 2;
  const salida = Buffer.alloc(Math.floor((n * a) / de) * 2);
  for (let i = 0; i < salida.length / 2; i += 1) {
    const pos = (i * de) / a;
    const j = Math.floor(pos);
    const f = pos - j;
    const x0 = pcm.readInt16LE(Math.min(j, n - 1) * 2);
    const x1 = pcm.readInt16LE(Math.min(j + 1, n - 1) * 2);
    salida.writeInt16LE(Math.round(x0 + (x1 - x0) * f), i * 2);
  }
  return salida;
}

/* ── Arranque ────────────────────────────────────────────────────────── */

exigirClave();

const voces = await listarVoces();

if (process.argv.includes("--listar")) {
  console.log(`\n${voces.length} voces en la cuenta:\n`);
  for (const v of voces) {
    const et = Object.values(v.labels || {}).filter(Boolean).join(", ");
    console.log(`  ${v.name.padEnd(22)} ${v.voice_id}  ${et}`);
  }
  console.log(`\nElige dos y genera:\n  VOZ_AGENTE="Nombre" VOZ_CLIENTE="Otro" node scripts/generar-muestra-elevenlabs.mjs\n`);
  process.exit(0);
}

function resolver(quien, valor) {
  if (!valor) {
    console.error(
      `Falta la voz de "${quien}".\n\n` +
      "Mira cuáles tienes:\n  node scripts/generar-muestra-elevenlabs.mjs --listar\n"
    );
    process.exit(1);
  }
  const porNombre = voces.find((v) => v.name.toLowerCase() === valor.toLowerCase());
  if (porNombre) return { id: porNombre.voice_id, nombre: porNombre.name };
  const porId = voces.find((v) => v.voice_id === valor);
  if (porId) return { id: porId.voice_id, nombre: porId.name };
  // Puede ser un ID de la biblioteca pública que no está añadido a la cuenta.
  return { id: valor, nombre: valor };
}

const vozAgente = resolver("agente", VOCES.agente);
const vozCliente = resolver("cliente", VOCES.cliente);

if (vozAgente.id === vozCliente.id) {
  console.error("Las dos voces son la misma. Con el mismo timbre en los dos lados se nota que es un montaje.");
  process.exit(1);
}

console.log(`Generando con ${MODELO}`);
console.log(`  agente  → ${vozAgente.nombre}`);
console.log(`  cliente → ${vozCliente.nombre}\n`);

const partes = [];
const guion = [];

for (let i = 0; i < GUION.length; i += 1) {
  const linea = GUION[i];
  const texto = linea.dicho || linea.texto;
  const voz = linea.quien === "agente" ? vozAgente : vozCliente;

  // Contexto sólo del mismo hablante: pasarle la frase del otro le hace
  // imitar su entonación, que es justo lo contrario de lo que queremos.
  const anterior = [...GUION.slice(0, i)].reverse().find((l) => l.quien === linea.quien);
  const siguiente = GUION.slice(i + 1).find((l) => l.quien === linea.quien);

  const bruto = await sintetizar(
    voz.id, texto, AJUSTES[linea.quien],
    anterior && (anterior.dicho || anterior.texto),
    siguiente && (siguiente.dicho || siguiente.texto),
  );

  const limpio = acortarPausasInternas(recortarSilencio(bruto, FRECUENCIA), FRECUENCIA);
  const inicio = partes.reduce((a, b) => a + b.length, 0) / 2 / FRECUENCIA;
  guion.push({ t: +inicio.toFixed(1), quien: linea.quien, texto: linea.texto });

  const corta = linea.texto.split(/\s+/).length <= 4;
  partes.push(limpio, silencio(huecoEntreTurnos(i, corta), FRECUENCIA));

  const seg = (limpio.length / 2 / FRECUENCIA).toFixed(1);
  console.log(`   ${linea.quien === "agente" ? "AGENTE " : "CLIENTE"} [${seg}s] ${linea.texto}`);
}

const pcm = Buffer.concat(partes);
fs.writeFileSync(SALIDA, envolverWav(pcm, FRECUENCIA));

const m = medirParones(pcm, FRECUENCIA);
console.log(`\n✓ ${SALIDA} · ${m.segundos.toFixed(1)} s · ${(fs.statSync(SALIDA).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  parón máximo ${Math.round(m.huecoMaximoMs)} ms · silencio ${m.silencioPorCiento.toFixed(0)} %`);

fs.writeFileSync(
  path.join("components", "v3", "muestra-guion.json"),
  JSON.stringify(guion, null, 2) + "\n"
);
console.log(`✓ components/v3/muestra-guion.json · ${guion.length} intervenciones`);
