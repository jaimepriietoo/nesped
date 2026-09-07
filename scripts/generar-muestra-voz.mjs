/**
 * Genera la llamada de muestra que suena en la portada.
 *
 *   node scripts/generar-muestra-voz.mjs
 *
 * Dos sesiones del modelo hablando entre ellas, no una locución.
 *
 * La primera versión sonaba a montaje por dos motivos, y los dos importan:
 *
 * 1. A las dos voces se les dictaba la frase exacta ("di esto"). Alguien
 *    leyendo un guion suena a alguien leyendo un guion: entonación plana,
 *    sin titubeos, sin arrancar por la mitad. Ahora cada lado tiene una
 *    persona detrás y una situación, y responde a lo que acaba de oír.
 *
 * 2. Salía en calidad de estudio. Una llamada real viaja por una red que
 *    sólo deja pasar de 300 a 3400 Hz, y ese recorte es justo lo que el oído
 *    reconoce como "teléfono". Sin él, por perfecta que sea la voz, no suena
 *    a llamada: suena a anuncio.
 */
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const MODELO = "gpt-realtime-2.1";
const FRECUENCIA = 24000;      // lo mínimo que acepta la API
const FRECUENCIA_SALIDA = 12000;
const SALIDA = path.join("public", "muestra-llamada.wav");
const EMPRESA = "Instalaciones Vega";

/* Voces de distinto timbre. Con la misma en los dos lados se nota que es el
   mismo modelo hablando solo, por muy bien que module. */
const VOCES = { agente: env.OPENAI_VOICE || "marin", cliente: "ash" };

/**
 * Qué tiene que conseguir el agente en cada turno.
 *
 * Sin esto se ponía a preguntar metros, plantas y municipio: preguntas
 * técnicas razonables que no capturan nada. La llamada terminaba sin nombre
 * ni teléfono, o sea sin lead, que es justo lo que la muestra tiene que
 * demostrar. Se le marca el objetivo; las palabras las elige él, que es lo
 * que hace que suene a persona y no a guion leído.
 */
const OBJETIVOS = [
  "Acusa recibo en una palabra y pide su nombre. UNA frase corta.",
  "Usa su nombre y pídele un teléfono de contacto. UNA frase corta.",
  "Repite el teléfono en grupos de tres para confirmarlo y di que le llaman hoy. Dos frases cortas.",
];

/* ── Personas ────────────────────────────────────────────────────────── */

function guionDelAgente() {
  const servidor = fs.readFileSync("voice-server.js", "utf8");
  const guion = servidor
    .slice(servidor.indexOf("return `\nEres quien coge el teléfono"),
           servidor.indexOf("`.trim();\n}\n\nfunction getDemoClientConfig"))
    .replace(/^return `\n/, "");

  return `${guion}

Trabajas en ${EMPRESA}. Cuando te presentes, di ${EMPRESA}. Nunca uses un
nombre inventado ni un marcador de posición.

Esta llamada es corta: en cuanto tengas nombre, teléfono y qué necesita,
confirma el teléfono repitiéndolo y cierra. No alargues.`;
}

const PERSONA_CLIENTE = `Eres Marta, una mujer de unos cuarenta años que llama desde el móvil a una
empresa de instalaciones, en castellano de España. Estás en casa, con algo
de prisa.

Llamas porque quieres presupuesto de aerotermia para tu chalet: unos ciento
ochenta metros, con suelo radiante ya puesto. Tu teléfono es el seis cero
dos, dos nueve siete, siete siete cero.

CÓMO HABLAS
No estás leyendo nada. Hablas como quien llama de verdad:
- Frases cortas, a veces sin terminar.
- Empiezas por la mitad: "sí, mira, es que…", "pues nada, que…".
- Dudas cuando piensas: "a ver…", "pues…", "creo que…".
- Sueltas un "vale", "ajá", "sí, sí" cuando te están explicando algo.
- No das todos los datos de golpe. Contestas sólo lo que te preguntan.
- Al final te despides corto, como quien cuelga: "vale, pues genial, gracias".

Nunca digas que eres una IA ni menciones que esto es una demostración.
Responde SIEMPRE en UNA frase corta. Nunca dos, nunca una explicación.
Si te preguntan el nombre, di sólo tu nombre. Si te piden el teléfono, dilo
en grupos, como se dice de viva voz. No añadas nada que no te hayan pedido.`;

/* ── Sesiones ────────────────────────────────────────────────────────── */

function abrirSesion({ voz, instrucciones }) {
  return new Promise((listo, fallo) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODELO}`, {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });
    const corte = setTimeout(() => fallo(new Error("no abrió la sesión")), 20000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model: MODELO,
          output_modalities: ["audio"],
          audio: { output: { format: { type: "audio/pcm", rate: FRECUENCIA }, voice: voz, speed: 1 } },
          instructions: instrucciones,
          max_output_tokens: 400,
        },
      }));
    });

    ws.on("message", (raw) => {
      const e = JSON.parse(raw.toString());
      if (e.type === "session.updated") { clearTimeout(corte); listo(ws); }
      if (e.type === "error") { clearTimeout(corte); fallo(new Error(e.error?.message || "error")); }
    });
    ws.on("error", (err) => { clearTimeout(corte); fallo(err); });
  });
}

/** Le cuenta a una sesión lo que acaba de decir la otra. */
function oye(ws, texto) {
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] },
  }));
}

/** Pide un turno y devuelve { pcm, texto }. */
function habla(ws, instrucciones) {
  return new Promise((listo, fallo) => {
    const trozos = [];
    let dicho = "";

    const alRecibir = (raw) => {
      const e = JSON.parse(raw.toString());
      if ((e.type === "response.output_audio.delta" || e.type === "response.audio.delta") && e.delta) {
        trozos.push(Buffer.from(e.delta, "base64"));
      }
      if (e.type === "response.output_audio_transcript.done" && e.transcript) dicho = e.transcript.trim();
      if (e.type === "response.done") { ws.off("message", alRecibir); listo({ pcm: Buffer.concat(trozos), texto: dicho }); }
      if (e.type === "error") { ws.off("message", alRecibir); fallo(new Error(e.error?.message || "error")); }
    };

    ws.on("message", alRecibir);
    ws.send(JSON.stringify({
      type: "response.create",
      response: instrucciones ? { instructions: instrucciones } : {},
    }));
  });
}

/* ── Tratamiento del audio ───────────────────────────────────────────── */

/**
 * Deja pasar sólo la banda telefónica, de 300 a 3400 Hz.
 *
 * Es lo que más acerca la muestra a una llamada de verdad. La red telefónica
 * recorta ahí, y el oído reconoce ese recorte al instante: sin él, una voz
 * perfecta suena a locución de anuncio, no a alguien al otro lado del hilo.
 *
 * Dos biquad de segundo orden en cascada, calculados con las fórmulas
 * estándar de Robert Bristow-Johnson.
 */
function bandaTelefonica(pcm, frecuencia) {
  function biquad(muestras, tipo, f0, Q) {
    const w = (2 * Math.PI * f0) / frecuencia;
    const alfa = Math.sin(w) / (2 * Q);
    const cos = Math.cos(w);

    let b0, b1, b2;
    if (tipo === "paso-alto") {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    }
    const a0 = 1 + alfa, a1 = -2 * cos, a2 = 1 - alfa;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const salida = new Float32Array(muestras.length);
    for (let i = 0; i < muestras.length; i += 1) {
      const x0 = muestras[i];
      const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
      salida[i] = y0;
    }
    return salida;
  }

  const n = pcm.length / 2;
  let m = new Float32Array(n);
  for (let i = 0; i < n; i += 1) m[i] = pcm.readInt16LE(i * 2) / 32768;

  m = biquad(m, "paso-alto", 300, 0.707);
  m = biquad(m, "paso-bajo", 3400, 0.707);

  // Filtrar baja el nivel; se recupera sin llegar a saturar.
  let pico = 0;
  for (let i = 0; i < n; i += 1) pico = Math.max(pico, Math.abs(m[i]));
  const ganancia = pico > 0 ? Math.min(3, 0.92 / pico) : 1;

  const salida = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    salida.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(m[i] * ganancia * 32768))), i * 2);
  }
  return salida;
}

/** Baja la frecuencia a la mitad promediando pares, para no meter siseo. */
function mitadDeFrecuencia(pcm) {
  const n = pcm.length / 2;
  const salida = Buffer.alloc(Math.floor(n / 2) * 2);
  for (let i = 0; i + 1 < n; i += 2) {
    salida.writeInt16LE(Math.round((pcm.readInt16LE(i * 2) + pcm.readInt16LE((i + 1) * 2)) / 2), (i / 2) * 2);
  }
  return salida;
}

function silencio(ms) {
  return Buffer.alloc(Math.round((FRECUENCIA * ms) / 1000) * 2);
}

function envolverWav(pcm, frecuencia) {
  const c = Buffer.alloc(44);
  c.write("RIFF", 0); c.writeUInt32LE(36 + pcm.length, 4); c.write("WAVE", 8);
  c.write("fmt ", 12); c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(1, 22);
  c.writeUInt32LE(frecuencia, 24); c.writeUInt32LE(frecuencia * 2, 28);
  c.writeUInt16LE(2, 32); c.writeUInt16LE(16, 34);
  c.write("data", 36); c.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([c, pcm]);
}

/* ── La llamada ──────────────────────────────────────────────────────── */

console.log(`Generando la llamada con ${MODELO}\n`);

const agente = await abrirSesion({ voz: VOCES.agente, instrucciones: guionDelAgente() });
const cliente = await abrirSesion({ voz: VOCES.cliente, instrucciones: PERSONA_CLIENTE });

const partes = [];
const guion = [];

function apuntar(quien, texto, pcm, pausaMs) {
  const inicio = partes.reduce((a, b) => a + b.length, 0) / 2 / FRECUENCIA;
  guion.push({ t: +inicio.toFixed(1), quien, texto });
  partes.push(pcm, silencio(pausaMs));
  console.log(`   ${quien === "agente" ? "AGENTE " : "CLIENTE"} ${texto}`);
}

// Descuelga.
let turno = await habla(agente, `Descuelga el teléfono. Di el nombre "${EMPRESA}" y un saludo corto. Nada más.`);
apuntar("agente", turno.texto, turno.pcm, 380);
oye(cliente, turno.texto);

for (let i = 0; i < OBJETIVOS.length; i += 1) {
  const c = await habla(cliente, "");
  apuntar("cliente", c.texto, c.pcm, 300);
  oye(agente, c.texto);

  const a = await habla(agente, OBJETIVOS[i]);
  apuntar("agente", a.texto, a.pcm, 360);
  oye(cliente, a.texto);
}

// Cierre: se despide quien llama y el agente remata.
const despedida = await habla(cliente, "Despídete en cuatro o cinco palabras y cuelga.");
apuntar("cliente", despedida.texto, despedida.pcm, 260);
oye(agente, despedida.texto);

const remate = await habla(agente, "Despídete en tres o cuatro palabras. Nada más.");
apuntar("agente", remate.texto, remate.pcm, 200);

agente.close();
cliente.close();

const crudo = Buffer.concat(partes);
const pcm = mitadDeFrecuencia(bandaTelefonica(crudo, FRECUENCIA));
fs.writeFileSync(SALIDA, envolverWav(pcm, FRECUENCIA_SALIDA));

const segundos = pcm.length / 2 / FRECUENCIA_SALIDA;
console.log(`\n✓ ${SALIDA} · ${segundos.toFixed(1)} s · ${(fs.statSync(SALIDA).size / 1024 / 1024).toFixed(2)} MB`);

// El guion se guarda para que la portada resalte la línea que suena sin
// tener que ajustar los tiempos a mano cada vez que se regenera el audio.
fs.writeFileSync(
  path.join("components", "v3", "muestra-guion.json"),
  JSON.stringify(guion, null, 2) + "\n"
);
console.log(`✓ components/v3/muestra-guion.json · ${guion.length} intervenciones`);
