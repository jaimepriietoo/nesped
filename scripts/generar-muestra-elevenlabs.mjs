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
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  recortarSilencio, acortarPausasInternas, huecoEntreTurnos,
  silencio, envolverWav, leerEnv, medirParones,
} from "./lib/audio-llamada.mjs";

const env = leerEnv(fs);
const CLAVE = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || "";
const FRECUENCIA = 24000;
const SALIDA_POR_DEFECTO = path.join("public", "muestra-llamada.wav");
const SALIDA = process.env.SALIDA || SALIDA_POR_DEFECTO;
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
 * Sintetiza una intervención.
 *
 * Se pide MP3 a 44,1 kHz y se decodifica aquí. Parece un rodeo teniendo la
 * API un formato PCM, pero el PCM por API es de plan Pro (99 $/mes) mientras
 * que el MP3 a 44,1 está en todos los planes, gratuito incluido. Decodificando
 * nosotros salimos ganando: 44,1 kHz de origen en vez de los 24 del PCM.
 *
 * afconvert viene con macOS. Donde no esté se cae a PCM, que sigue
 * funcionando aunque con menos ancho de banda.
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

  async function pedirAudio(formato) {
    const r = await pedir(`/text-to-speech/${voiceId}?output_format=${formato}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return Buffer.from(await r.arrayBuffer());
  }

  if (hayAfconvert()) {
    return decodificarMp3(await pedirAudio("mp3_44100_128"));
  }

  try {
    return await pedirAudio("pcm_24000");
  } catch {
    console.log("   (pcm_24000 no disponible en este plan, uso 16 kHz)");
    return remuestrear(await pedirAudio("pcm_16000"), 16000, FRECUENCIA);
  }
}

let _afconvert = null;
function hayAfconvert() {
  if (_afconvert === null) {
    try {
      execFileSync("/usr/bin/afconvert", ["-h"], { stdio: "ignore" });
      _afconvert = true;
    } catch { _afconvert = false; }
  }
  return _afconvert;
}

function decodificarMp3(mp3) {
  const base = path.join(os.tmpdir(), `nesped-voz-${process.pid}-${Date.now()}`);
  const entrada = `${base}.mp3`;
  const salida = `${base}.wav`;
  try {
    fs.writeFileSync(entrada, mp3);
    // LEI16@24000 = PCM 16 bits little-endian a 24 kHz; -c 1 mono.
    execFileSync("/usr/bin/afconvert", ["-f", "WAVE", "-d", `LEI16@${FRECUENCIA}`, "-c", "1", entrada, salida], { stdio: "ignore" });
    const wav = fs.readFileSync(salida);
    return wav.subarray(saltarCabeceraWav(wav));
  } finally {
    for (const f of [entrada, salida]) { try { fs.unlinkSync(f); } catch {} }
  }
}

/** afconvert no siempre deja la cabecera en 44 bytes: hay que buscar "data". */
function saltarCabeceraWav(wav) {
  let i = 12;
  while (i + 8 <= wav.length) {
    const id = wav.toString("ascii", i, i + 4);
    const largo = wav.readUInt32LE(i + 4);
    if (id === "data") return i + 8;
    i += 8 + largo + (largo % 2);
  }
  return 44;
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

/**
 * Busca una voz en la biblioteca pública y la añade a la cuenta.
 *
 * Hace falta porque la cuenta trae 24 voces y sólo dos hablan español
 * peninsular, las dos mujeres. Las inglesas pueden decir español con el
 * modelo multilingüe, pero con acento extranjero, que para una empresa
 * española suena peor que el problema que veníamos a arreglar.
 */
async function añadirDeLaBiblioteca(valor) {
  const r = await pedir("/shared-voices?language=es&page_size=100&sort=trending");
  const { voices = [] } = await r.json();
  const v = voices.find((x) => x.voice_id === valor)
    || voices.find((x) => (x.name || "").toLowerCase().startsWith(valor.toLowerCase()));
  if (!v) return null;

  await pedir(`/voices/add/${v.public_owner_id}/${v.voice_id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ new_name: v.name }),
  });
  console.log(`   + añadida a la cuenta: ${v.name}`);
  return { id: v.voice_id, nombre: v.name };
}

async function resolver(quien, valor) {
  if (!valor) {
    console.error(
      `Falta la voz de "${quien}".\n\n` +
      "Mira cuáles tienes:\n  node scripts/generar-muestra-elevenlabs.mjs --listar\n"
    );
    process.exit(1);
  }
  // Los nombres de la biblioteca llevan coletilla ("Cristina - Empathetic
  // Customer support"), así que basta con que empiece igual.
  const v = valor.toLowerCase();
  const porNombre = voces.find((x) => x.name.toLowerCase() === v)
    || voces.find((x) => x.name.toLowerCase().startsWith(v));
  if (porNombre) return { id: porNombre.voice_id, nombre: porNombre.name };
  const porId = voces.find((v) => v.voice_id === valor);
  if (porId) return { id: porId.voice_id, nombre: porId.name };
  const deBiblioteca = await añadirDeLaBiblioteca(valor);
  if (deBiblioteca) return deBiblioteca;

  console.error(`No encuentro la voz "${valor}" ni en la cuenta ni en la biblioteca en español.`);
  process.exit(1);
}

const vozAgente = await resolver("agente", VOCES.agente);
const vozCliente = await resolver("cliente", VOCES.cliente);

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

// El guion se guarda para que la portada resalte la línea que suena. Sólo
// para el audio definitivo: las pruebas comparativas no deben tocarlo.
if (SALIDA === SALIDA_POR_DEFECTO) {
  fs.writeFileSync(
    path.join("components", "v3", "muestra-guion.json"),
    JSON.stringify(guion, null, 2) + "\n"
  );
  console.log(`✓ components/v3/muestra-guion.json · ${guion.length} intervenciones`);
}
