/**
 * Simula una llamada completa y juzga el comportamiento del agente.
 *
 *   node probar-conversacion.mjs
 *
 * Habla por texto en vez de por audio —el comportamiento que se quiere medir
 * es el mismo— y comprueba lo que de verdad delata a una máquina: respuestas
 * largas, enumeraciones, muletillas de asistente, preguntar tres cosas a la
 * vez y no llegar a guardar el lead.
 */
import fs from "node:fs";
import WebSocket from "ws";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const servidor = fs.readFileSync("voice-server.js", "utf8");
const MODELO = servidor.match(/OPENAI_REALTIME_MODEL \|\| "([^"]+)"/)[1];
const VOZ = servidor.match(/OPENAI_VOICE \|\| "([^"]+)"/)[1];
const PROMPT = servidor
  .slice(servidor.indexOf("return `\nEres quien coge el teléfono"),
         servidor.indexOf("`.trim();\n}\n\nfunction getDemoClientConfig"))
  .replace(/^return `\n/, "");

const GUION = [
  "Hola buenas, llamaba para pedir presupuesto de aerotermia",
  "Pues para un chalet, de unos ciento ochenta metros",
  "Me llamo Marta Rubio",
  "Seis cero dos, dos nueve siete, siete siete cero",
  "En Valladolid, en la zona de Parquesol",
  "Vale, pues perfecto. Muchas gracias, hasta luego",
];

// Frases que en una llamada real cantan muchísimo.
const DELATORES = [
  /en qué m[áa]s puedo (ayudar|asistir)/i, /hay algo m[áa]s en lo que/i,
  /como (asistente|inteligencia artificial|IA)\b/i, /soy un (asistente|bot)/i,
  /excelente pregunta/i, /estar[ée] encantad/i, /no dude en/i,
  /a continuaci[óo]n le detallo/i, /^(en primer lugar|primero de todo)/im,
  /\bahorita\b|\bplaticar\b|\bcelular\b|\bcarro\b/i,
];

const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODELO}`, {
  headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
});

let turno = -1;
let leadGuardado = null;
const respuestas = [];
let acumulado = "";

const corte = setTimeout(() => { console.log("\n✗ la conversación se ha quedado colgada"); process.exit(1); }, 120000);

function hablar(texto) {
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] },
  }));
  ws.send(JSON.stringify({ type: "response.create" }));
}

function siguiente() {
  turno += 1;
  if (turno >= GUION.length) return terminar();
  console.log(`\n  CLIENTE  ${GUION[turno]}`);
  hablar(GUION[turno]);
}

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      model: MODELO,
      // Sólo texto: se está midiendo el comportamiento, no el timbre, y así
      // la prueba tarda segundos en vez de minutos.
      output_modalities: ["text"],
      instructions: PROMPT,
      max_output_tokens: 320,
      tools: [{
        type: "function",
        name: "guardar_lead",
        description: "Guardar un lead cuando ya tengas nombre, teléfono y necesidad del usuario.",
        parameters: {
          type: "object",
          properties: {
            nombre: { type: "string" }, telefono: { type: "string" },
            necesidad: { type: "string" }, ciudad: { type: "string" },
          },
          required: ["nombre", "telefono", "necesidad"],
        },
      }],
      tool_choice: "auto",
    },
  }));
});

ws.on("message", (raw) => {
  const e = JSON.parse(raw.toString());

  if (e.type === "session.updated") { console.log(`sesión lista · ${MODELO} · voz ${VOZ}`); return siguiente(); }

  if (e.type === "response.output_text.delta" && e.delta) acumulado += e.delta;

  if (e.type === "response.function_call_arguments.done") {
    try { leadGuardado = JSON.parse(e.arguments); } catch { leadGuardado = { crudo: e.arguments }; }
    console.log(`   herramienta guardar_lead → ${JSON.stringify(leadGuardado)}`);
  }

  if (e.type === "response.done") {
    const dicho = acumulado.trim();
    acumulado = "";
    if (dicho) { respuestas.push(dicho); console.log(`  AGENTE   ${dicho}`); }
    setTimeout(siguiente, 250);
  }

  if (e.type === "error") { console.log("✗", e.error?.message); clearTimeout(corte); process.exit(1); }
});

function terminar() {
  clearTimeout(corte);
  ws.close();

  console.log("\n═══ evaluación ═══");
  let fallos = 0;
  const juzgar = (ok, txt) => { if (!ok) fallos += 1; console.log(`${ok ? "✓" : "✗"} ${txt}`); };

  const palabras = respuestas.map((r) => r.split(/\s+/).length);
  const media = palabras.reduce((a, b) => a + b, 0) / (palabras.length || 1);
  const masLarga = Math.max(...palabras, 0);

  juzgar(media <= 30, `respuesta media de ${media.toFixed(0)} palabras (límite 30)`);
  juzgar(masLarga <= 60, `la más larga, ${masLarga} palabras (límite 60)`);

  const conDelator = respuestas.filter((r) => DELATORES.some((d) => d.test(r)));
  juzgar(conDelator.length === 0, conDelator.length ? `frases delatoras: ${conDelator[0].slice(0, 70)}…` : "sin frases de asistente virtual");

  const conLista = respuestas.filter((r) => /^\s*[-*•]\s|\n\s*\d\./m.test(r));
  juzgar(conLista.length === 0, conLista.length ? `${conLista.length} respuesta(s) con lista` : "sin listas ni enumeraciones");

  const multiPregunta = respuestas.filter((r) => (r.match(/\?/g) || []).length > 1);
  juzgar(multiPregunta.length === 0, multiPregunta.length ? `${multiPregunta.length} respuesta(s) con varias preguntas a la vez` : "una pregunta cada vez");

  juzgar(Boolean(leadGuardado), leadGuardado ? "lead guardado" : "NO llegó a guardar el lead");
  if (leadGuardado) {
    juzgar(/marta/i.test(leadGuardado.nombre || ""), `nombre: ${leadGuardado.nombre}`);
    juzgar(/60229777\d|602 ?29 ?7 ?77 ?0|6022977 ?70/.test(String(leadGuardado.telefono || "").replace(/\D/g, "")) || String(leadGuardado.telefono || "").replace(/\D/g, "").includes("602297770"), `teléfono: ${leadGuardado.telefono}`);
    juzgar(/aerotermia/i.test(leadGuardado.necesidad || ""), `necesidad: ${leadGuardado.necesidad}`);
  }

  console.log(fallos === 0 ? "\n✓ El agente se comporta como una persona." : `\n✗ ${fallos} problema(s).`);
  process.exit(fallos === 0 ? 0 : 1);
}

ws.on("error", (e) => { console.log("✗ conexión:", e.message); process.exit(1); });
