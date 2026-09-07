/**
 * Prueba de extremo a extremo de la sesión de voz.
 *
 *   node probar-voz.mjs
 *
 * Abre una sesión real contra OpenAI con exactamente la configuración que
 * usa voice-server.js, comprueba que la acepta, pide el saludo y mide cuánto
 * tarda en empezar a sonar. Sin esto, la única forma de saber si la voz
 * funciona era llamar por teléfono.
 */
import fs from "node:fs";
import WebSocket from "ws";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

// Se lee la configuración del propio servidor, para probar lo que se despliega.
const servidor = fs.readFileSync("voice-server.js", "utf8");
const MODELO = servidor.match(/OPENAI_REALTIME_MODEL \|\| "([^"]+)"/)?.[1];
const VOZ = servidor.match(/OPENAI_VOICE \|\| "([^"]+)"/)?.[1];
const PROMPT = servidor.slice(
  servidor.indexOf("return `\nEres quien coge el teléfono"),
  servidor.indexOf("`.trim();\n}\n\nfunction getDemoClientConfig")
).replace(/^return `\n/, "");

console.log(`modelo: ${MODELO}\nvoz:    ${VOZ}\nprompt: ${PROMPT.length} caracteres\n`);

const t0 = Date.now();
let tSesion = null, tPrimerAudio = null, bytes = 0, texto = "";

const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODELO}`, {
  headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
});

const corte = setTimeout(() => { console.log("✗ sin respuesta en 40 s"); process.exit(1); }, 40000);

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      model: MODELO,
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          noise_reduction: { type: "far_field" },
          transcription: { model: "gpt-4o-mini-transcribe", language: "es" },
          turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true },
        },
        output: { format: { type: "audio/pcmu" }, voice: VOZ, speed: 1.0 },
      },
      instructions: PROMPT,
      max_output_tokens: 320,
      tools: [{
        type: "function",
        name: "guardar_lead",
        description: "Guardar un lead cuando ya tengas nombre, teléfono y necesidad.",
        parameters: {
          type: "object",
          properties: { nombre: { type: "string" }, telefono: { type: "string" }, necesidad: { type: "string" } },
          required: ["nombre", "telefono", "necesidad"],
        },
      }],
      tool_choice: "auto",
    },
  }));
});

ws.on("message", (raw) => {
  const e = JSON.parse(raw.toString());

  if (e.type === "session.updated" && !tSesion) {
    tSesion = Date.now() - t0;
    const s = e.session;
    console.log(`✓ sesión aceptada en ${tSesion} ms`);
    console.log(`   voz=${s.audio?.output?.voice} vad=${s.audio?.input?.turn_detection?.type}/${s.audio?.input?.turn_detection?.eagerness}`);
    console.log(`   ruido=${s.audio?.input?.noise_reduction?.type} tope=${s.max_output_tokens} herramientas=${s.tools?.length}`);

    ws.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions: `Descuelga el teléfono como lo haría una persona de Clínica Dental Sur.
Una sola frase, muy corta, en castellano de España. Después de saludar, calla y espera.`,
      },
    }));
    console.log("\n→ pidiendo el saludo…");
  }

  if ((e.type === "response.output_audio.delta" || e.type === "response.audio.delta") && e.delta) {
    if (!tPrimerAudio) {
      tPrimerAudio = Date.now() - t0;
      console.log(`✓ primer audio a los ${tPrimerAudio} ms`);
    }
    bytes += Buffer.from(e.delta, "base64").length;
  }

  if (e.type === "response.output_audio_transcript.delta" && e.delta) texto += e.delta;
  if (e.type === "response.output_audio_transcript.done" && e.transcript) texto = e.transcript;

  if (e.type === "response.done") {
    // g711 a 8 kHz: un byte por muestra, 8000 muestras por segundo.
    const segundos = (bytes / 8000).toFixed(1);
    console.log(`✓ saludo completo: ${segundos} s de audio (${bytes} bytes)`);
    console.log(`\n  Dice: "${texto.trim()}"\n`);

    const largo = texto.trim().split(/\s+/).length;
    console.log(largo <= 18 ? `✓ saludo corto (${largo} palabras)` : `✗ saludo largo: ${largo} palabras`);
    const delator = /asistente virtual|inteligencia artificial|en qué más puedo|estaré encantad/i.test(texto);
    console.log(delator ? "✗ contiene una frase que delata a una máquina" : "✓ sin frases delatoras");

    clearTimeout(corte); ws.close();
    process.exit(largo <= 18 && !delator ? 0 : 1);
  }

  if (e.type === "error") {
    console.log(`✗ ${e.error?.message}`);
    clearTimeout(corte); process.exit(1);
  }
});

ws.on("error", (e) => { console.log("✗ conexión:", e.message); process.exit(1); });
