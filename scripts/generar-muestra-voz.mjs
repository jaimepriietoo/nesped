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
const SALIDA = path.join("public", "muestra-llamada.wav");
const EMPRESA = "Instalaciones Vega";

/* Voces de distinto timbre. Con la misma en los dos lados se nota que es el
   mismo modelo hablando solo, por muy bien que module. */
/* marin y cedar son las voces nuevas de la versión GA, las que suenan más
   humanas. "ash" tiene un timbre más plano y en una conversación corta se
   nota mucho. */
const VOCES = {
  agente: process.env.VOZ_AGENTE || env.OPENAI_VOICE || "marin",
  cliente: process.env.VOZ_CLIENTE || "cedar",
};

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
  "Acusa recibo en una palabra y pide su nombre. UNA frase corta, en tono cálido y cercano.",
  "Usa su nombre y pídele un teléfono de contacto. UNA frase corta y natural, sin fórmulas.",
  "Repite el teléfono en grupos de tres y di que le llaman hoy pero tuteando: \"te llaman hoy\". Dos frases cortas. Empieza por \"vale\" o \"perfecto\", nunca por \"confirmo\". Jamás \"le llaman\" ni \"usted\".",
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
confirma el teléfono repitiéndolo y cierra. No alargues.

CÓMO SUENAS
Cálida y cercana, como quien coge el teléfono de buen humor un martes por la
mañana. Nada de tono de locución ni de atención al cliente de compañía
telefónica.

- No digas "confirmo", "procedo", "le informo" ni "de acuerdo con".
  Di "vale", "perfecto", "genial", "muy bien".
- Sonríe al hablar. Se nota en la voz.
- No vocalices de más. Habla como se habla, no como se lee.
- Deja que la frase caiga al final en vez de terminarla con tono neutro.
- Trata de tú, nunca de usted.`;
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

CÓMO SUENAS
Relajada, con la voz de quien está en casa y habla por el móvil. Ni proyectas
ni vocalizas: hablas normal, incluso un poco desganada al principio, como
quien hace una gestión más del día.

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
          audio: { output: { format: { type: "audio/pcm", rate: FRECUENCIA }, voice: voz, speed: 1.08 } },
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

/*
 * Aquí había un filtro de banda telefónica de 300 a 3400 Hz y una bajada a
 * la mitad de frecuencia.
 *
 * La idea era que sonase "a llamada de verdad". El resultado fue el
 * contrario: recortar todo por debajo de 300 Hz se lleva el cuerpo de la
 * voz, y cortar por arriba a 3400 se lleva la claridad de las consonantes.
 * Lo que queda es una voz fina y metálica: precisamente lo que suena a
 * máquina. Y encima nadie escucha esta muestra por un auricular de teléfono,
 * sino por los altavoces del portátil, donde ese recorte no aporta realismo,
 * sólo lo estropea.
 *
 * El audio va ahora tal y como sale del modelo, a 24 kHz y sin tocar. Pesa
 * más, pero sólo se descarga si alguien pulsa al play.
 */

/**
 * Quita el silencio del principio y del final de una intervención.
 *
 * El modelo entrega cada respuesta con aire por delante y por detrás. Al
 * pegar los turnos, ese aire se suma a la pausa que se mete entre ellos y
 * salen huecos de casi un segundo entre frase y frase. Medido sobre la
 * versión anterior: el 36 % de la llamada era silencio, con parones de
 * 860 ms. En una conversación de verdad el hueco entre turnos ronda los
 * 200 ms. Eso es lo que hace que suene a máquina turnándose, no a dos
 * personas hablando.
 *
 * Se deja un pequeño margen para no cortar el ataque de la primera sílaba
 * ni la caída de la última, que sonaría a corte brusco.
 */
function recortarSilencio(pcm, frecuencia) {
  const n = pcm.length / 2;
  const ventana = Math.round(frecuencia * 0.01); // 10 ms
  const umbral = 700;                            // sobre 32768

  function primerSonido(desde, hasta, paso) {
    for (let i = desde; paso > 0 ? i < hasta : i > hasta; i += paso * ventana) {
      let pico = 0;
      for (let k = 0; k < ventana && i + k < n && i + k >= 0; k += 1) {
        pico = Math.max(pico, Math.abs(pcm.readInt16LE((i + k) * 2)));
      }
      if (pico > umbral) return i;
    }
    return paso > 0 ? desde : hasta;
  }

  const margen = Math.round(frecuencia * 0.04); // 40 ms de respiro
  const ini = Math.max(0, primerSonido(0, n, 1) - margen);
  const fin = Math.min(n, primerSonido(n - ventana, 0, -1) + ventana + margen);

  if (fin <= ini) return pcm;
  return pcm.subarray(ini * 2, fin * 2);
}

/**
 * Acorta los silencios largos que quedan DENTRO de una intervención.
 *
 * Recortar los bordes no bastaba: el modelo también se para a media frase, y
 * ahí estaban la mayoría de los parones. Medido sobre la versión anterior,
 * 31 huecos para 9 intervenciones y "Vale, el teléfono es 602 297 770"
 * tardando 8,3 segundos en decirse.
 *
 * Se recortan sólo los que pasan del techo. Las micropausas cortas se dejan
 * intactas a propósito: son las que hacen que suene a persona, y quitarlas
 * todas produce el efecto contrario, un chorro de palabras sin respirar.
 */
function acortarPausasInternas(pcm, frecuencia, techoMs = 260) {
  const n = pcm.length / 2;
  const ventana = Math.round(frecuencia * 0.01);
  const techo = Math.round((frecuencia * techoMs) / 1000);
  const umbral = 700;

  const trozos = [];
  let inicioSilencio = null;
  let cursor = 0;

  for (let i = 0; i + ventana <= n; i += ventana) {
    let pico = 0;
    for (let k = 0; k < ventana; k += 1) pico = Math.max(pico, Math.abs(pcm.readInt16LE((i + k) * 2)));

    if (pico < umbral) {
      if (inicioSilencio === null) inicioSilencio = i;
    } else if (inicioSilencio !== null) {
      const largo = i - inicioSilencio;
      if (largo > techo) {
        // Todo hasta donde empieza el silencio, más el silencio ya recortado.
        trozos.push(pcm.subarray(cursor * 2, (inicioSilencio + techo) * 2));
        cursor = i;
      }
      inicioSilencio = null;
    }
  }

  trozos.push(pcm.subarray(cursor * 2));
  return Buffer.concat(trozos);
}

/**
 * Hueco entre turnos.
 *
 * Ni fijo ni al azar puro. En una conversación española el relevo va de unos
 * 120 a 320 ms, y se acorta cuando la respuesta es evidente —un nombre, un
 * "sí"— y se alarga un poco cuando hay que pensar. Un hueco idéntico entre
 * todas las frases suena a metrónomo, y las personas no somos metrónomos.
 */
function huecoEntreTurnos(indice, esRespuestaCorta) {
  const base = esRespuestaCorta ? 130 : 210;
  // Variación determinista: la misma escena suena igual en cada generación,
  // pero los huecos no son todos iguales entre sí.
  const variacion = [0, 60, -35, 90, -20, 45, 25, -45, 70][indice % 9];
  return Math.max(90, base + variacion);
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

let nTurno = 0;

function apuntar(quien, texto, pcm) {
  const limpio = acortarPausasInternas(recortarSilencio(pcm, FRECUENCIA), FRECUENCIA);
  const inicio = partes.reduce((a, b) => a + b.length, 0) / 2 / FRECUENCIA;
  guion.push({ t: +inicio.toFixed(1), quien, texto });

  // Una respuesta de pocas palabras llega antes: no hay nada que pensar.
  const corta = texto.split(/\s+/).length <= 4;
  partes.push(limpio, silencio(huecoEntreTurnos(nTurno, corta)));
  nTurno += 1;

  const segundos = (limpio.length / 2 / FRECUENCIA).toFixed(1);
  console.log(`   ${quien === "agente" ? "AGENTE " : "CLIENTE"} [${segundos}s] ${texto}`);
}

// Descuelga.
let turno = await habla(agente, `Descuelga el teléfono. Di el nombre "${EMPRESA}" y un saludo corto. Nada más.`);
apuntar("agente", turno.texto, turno.pcm);
oye(cliente, turno.texto);

for (let i = 0; i < OBJETIVOS.length; i += 1) {
  const c = await habla(cliente, "");
  apuntar("cliente", c.texto, c.pcm);
  oye(agente, c.texto);

  const a = await habla(agente, OBJETIVOS[i]);
  apuntar("agente", a.texto, a.pcm);
  oye(cliente, a.texto);
}

// Cierre: se despide quien llama y el agente remata.
const despedida = await habla(cliente, "Despídete en cuatro o cinco palabras y cuelga.");
apuntar("cliente", despedida.texto, despedida.pcm);
oye(agente, despedida.texto);

const remate = await habla(agente, "Despídete en tres o cuatro palabras. Nada más.");
apuntar("agente", remate.texto, remate.pcm);

agente.close();
cliente.close();

const crudo = Buffer.concat(partes);
const pcm = crudo;
fs.writeFileSync(SALIDA, envolverWav(pcm, FRECUENCIA));

const segundos = pcm.length / 2 / FRECUENCIA;
console.log(`\n✓ ${SALIDA} · ${segundos.toFixed(1)} s · ${(fs.statSync(SALIDA).size / 1024 / 1024).toFixed(2)} MB`);

// El guion se guarda para que la portada resalte la línea que suena sin
// tener que ajustar los tiempos a mano cada vez que se regenera el audio.
fs.writeFileSync(
  path.join("components", "v3", "muestra-guion.json"),
  JSON.stringify(guion, null, 2) + "\n"
);
console.log(`✓ components/v3/muestra-guion.json · ${guion.length} intervenciones`);
