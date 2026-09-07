/**
 * Genera la muestra de audio que suena en la portada.
 *
 *   node scripts/generar-muestra-voz.mjs
 *
 * Es una llamada de verdad, no una locución: las dos voces salen del mismo
 * modelo que atiende el teléfono, con el mismo guion de Nesped. Lo que se oye
 * en la web es literalmente lo que oiría alguien que llamase.
 *
 * Se genera aquí y se guarda como fichero en vez de sintetizarse en el
 * navegador: así la portada no depende de una llamada a OpenAI para cargar,
 * no cuesta dinero por visita y suena igual siempre.
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
/* La API no baja de 24 kHz, así que se genera ahí y se remuestrea a la mitad
   antes de guardar. Una llamada real viaja a 8 kHz, con lo que 12 kHz sigue
   estando por encima de lo que se oiría por teléfono y el fichero pesa la
   mitad: en una portada, un audio de dos megas es un audio que nadie espera
   a que cargue. */
const FRECUENCIA = 24000;
const FRECUENCIA_SALIDA = 12000;
const SALIDA = path.join("public", "muestra-llamada.wav");

/* La empresa de la escena. Se nombra en el guion y en cada turno del agente:
   dejarlo sólo al final de las instrucciones no bastaba y el modelo saludaba
   con "Empresa Ejemplo". */
const EMPRESA = "Instalaciones Vega";

/* El guion de la escena. La persona que llama es una voz distinta y con su
   propia personalidad, para que no suene a la misma voz hablando sola. */
const ESCENA = [
  { quien: "agente", texto: `Descuelga diciendo exactamente el nombre "${EMPRESA}" y un saludo. Una frase corta, nada más.` },
  { quien: "cliente", texto: "Hola buenas, llamaba para pedir presupuesto de aerotermia para un chalet." },
  { quien: "agente", texto: "Acusa recibo con una palabra y pregunta el tamaño de la vivienda. UNA sola frase." },
  { quien: "cliente", texto: "Pues son unos ciento ochenta metros, y ya tenemos suelo radiante puesto." },
  { quien: "agente", texto: "Di que con suelo radiante encaja bien y pide su nombre. UNA sola frase corta, sin explicar por qué encaja." },
  { quien: "cliente", texto: "Marta Rubio." },
  { quien: "agente", texto: "Pide un teléfono de contacto. UNA sola frase corta." },
  { quien: "cliente", texto: "Seis cero dos, dos nueve siete, siete siete cero." },
  { quien: "agente", texto: "Repite el teléfono en grupos de tres para confirmarlo y cierra diciendo que le llaman hoy. Dos frases cortas." },
];

const VOCES = {
  agente: env.OPENAI_VOICE || "marin",
  cliente: "cedar",
};

/** Instrucciones de cada lado de la llamada. */
function instruccionesDe(quien) {
  if (quien === "agente") {
    const servidor = fs.readFileSync("voice-server.js", "utf8");
    const guion = servidor
      .slice(servidor.indexOf("return `\nEres quien coge el teléfono"),
             servidor.indexOf("`.trim();\n}\n\nfunction getDemoClientConfig"))
      .replace(/^return `\n/, "");
    return `${guion}\n\nTrabajas en ${EMPRESA}. Cuando te presentes o te pregunten de dónde llamas, di ${EMPRESA}. Nunca uses un nombre inventado ni un marcador de posición.`;
  }
  return `Eres una persona normal llamando por teléfono a una empresa de instalaciones,
en castellano de España. Hablas relajada, con frases cortas y naturales, como quien
llama desde el móvil. No eres comercial ni locutora: no vocalizas de más ni pones
tono de anuncio. Di exactamente lo que se te indique, con tu propia entonación.`;
}

/**
 * Sesión persistente del agente.
 *
 * Una sola conexión para toda la llamada, no una por turno. En la primera
 * versión cada intervención abría su propia sesión y el agente no recordaba
 * nada: se inventaba el nombre de la empresa y pedía el teléfono después de
 * que se lo hubieran dado. Manteniendo la sesión, el modelo acumula la
 * conversación igual que en una llamada de verdad.
 */
function abrirAgente() {
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
          audio: { output: { format: { type: "audio/pcm", rate: FRECUENCIA }, voice: VOCES.agente, speed: 1 } },
          instructions: instruccionesDe("agente"),
          max_output_tokens: 500,
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

/** Pide un turno al agente sobre la sesión ya abierta. */
function turnoDelAgente(ws, orden) {
  return new Promise((listo, fallo) => {
    const trozos = [];
    let dicho = "";

    const alRecibir = (raw) => {
      const e = JSON.parse(raw.toString());

      if ((e.type === "response.output_audio.delta" || e.type === "response.audio.delta") && e.delta) {
        trozos.push(Buffer.from(e.delta, "base64"));
      }
      if (e.type === "response.output_audio_transcript.done" && e.transcript) dicho = e.transcript.trim();

      if (e.type === "response.done") {
        ws.off("message", alRecibir);
        console.log(`   AGENTE  ${dicho}`);
        listo(Buffer.concat(trozos));
      }
      if (e.type === "error") { ws.off("message", alRecibir); fallo(new Error(e.error?.message || "error")); }
    };

    ws.on("message", alRecibir);
    ws.send(JSON.stringify({ type: "response.create", response: { instructions: orden } }));
  });
}

/** Mete en la conversación del agente lo que acaba de decir quien llama. */
function loQueDijoElCliente(ws, texto) {
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] },
  }));
}

/** Sintetiza una frase de quien llama. No necesita memoria: sólo lee. */
function vozDelCliente(texto) {
  return new Promise((listo, fallo) => {
    const trozos = [];
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODELO}`, {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });

    const corte = setTimeout(() => { ws.close(); fallo(new Error("tiempo agotado")); }, 45000);
    let pedido = false;

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model: MODELO,
          output_modalities: ["audio"],
          audio: { output: { format: { type: "audio/pcm", rate: FRECUENCIA }, voice: VOCES.cliente, speed: 1 } },
          instructions: instruccionesDe("cliente"),
          max_output_tokens: 150,
        },
      }));
    });

    ws.on("message", (raw) => {
      const e = JSON.parse(raw.toString());

      if (e.type === "session.updated" && !pedido) {
        pedido = true;
        ws.send(JSON.stringify({
          type: "response.create",
          response: { instructions: `Di exactamente esto, ni una palabra más: "${texto}"` },
        }));
      }
      if ((e.type === "response.output_audio.delta" || e.type === "response.audio.delta") && e.delta) {
        trozos.push(Buffer.from(e.delta, "base64"));
      }
      if (e.type === "response.done") { clearTimeout(corte); ws.close(); console.log(`   CLIENTE ${texto}`); listo(Buffer.concat(trozos)); }
      if (e.type === "error") { clearTimeout(corte); ws.close(); fallo(new Error(e.error?.message || "error")); }
    });

    ws.on("error", (err) => { clearTimeout(corte); fallo(err); });
  });
}

/** Silencio, para separar los turnos como en una conversación real. */
function silencio(ms) {
  return Buffer.alloc(Math.round((FRECUENCIA * ms) / 1000) * 2);
}

/**
 * Baja la frecuencia a la mitad promediando cada par de muestras.
 *
 * Promediar y no simplemente descartar una de cada dos: quedarse con una
 * suelta pliega las frecuencias altas sobre las bajas y mete un siseo
 * metálico. La media hace de filtro rudimentario y evita ese artefacto.
 */
function mitadDeFrecuencia(pcm) {
  const muestras = pcm.length / 2;
  const salida = Buffer.alloc(Math.floor(muestras / 2) * 2);

  for (let i = 0; i + 1 < muestras; i += 2) {
    const media = Math.round((pcm.readInt16LE(i * 2) + pcm.readInt16LE((i + 1) * 2)) / 2);
    salida.writeInt16LE(media, (i / 2) * 2);
  }
  return salida;
}

/** Envuelve PCM16 mono en una cabecera WAV. */
function envolverWav(pcm, frecuencia) {
  const c = Buffer.alloc(44);
  c.write("RIFF", 0);
  c.writeUInt32LE(36 + pcm.length, 4);
  c.write("WAVE", 8);
  c.write("fmt ", 12);
  c.writeUInt32LE(16, 16);
  c.writeUInt16LE(1, 20);          // PCM sin comprimir
  c.writeUInt16LE(1, 22);          // mono
  c.writeUInt32LE(frecuencia, 24);
  c.writeUInt32LE(frecuencia * 2, 28);
  c.writeUInt16LE(2, 32);
  c.writeUInt16LE(16, 34);
  c.write("data", 36);
  c.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([c, pcm]);
}

console.log(`Generando la muestra con ${MODELO}\n`);

const agente = await abrirAgente();
const partes = [];

for (const paso of ESCENA) {
  if (paso.quien === "cliente") {
    partes.push(await vozDelCliente(paso.texto));
    // El agente tiene que "oír" lo que se acaba de decir para poder seguir.
    loQueDijoElCliente(agente, paso.texto);
    partes.push(silencio(320));
  } else {
    partes.push(await turnoDelAgente(agente, paso.texto));
    // Una persona tarda un poco en contestar; sin esta pausa suena a montaje.
    partes.push(silencio(420));
  }
}

agente.close();

const pcm = mitadDeFrecuencia(Buffer.concat(partes));
fs.writeFileSync(SALIDA, envolverWav(pcm, FRECUENCIA_SALIDA));

const segundos = pcm.length / 2 / FRECUENCIA_SALIDA;
console.log(`\n✓ ${SALIDA} · ${segundos.toFixed(1)} s · ${(fs.statSync(SALIDA).size / 1024 / 1024).toFixed(2)} MB`);
