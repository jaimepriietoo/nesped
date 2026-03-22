require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);
const client = twilio(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

app.get("/", (req, res) => {
  res.send("NESPED Voice Server activo");
});

app.get("/call", async (req, res) => {
  try {
    const call = await client.calls.create({
      to: process.env.TU_NUMERO,
      from: process.env.TWILIO_NUMERO,
      url: process.env.BASE_URL + "/voice",
      method: "POST",
    });

    console.log("📞 Llamada iniciada:", call.sid);
    res.send("Llamada iniciada: " + call.sid);
  } catch (error) {
    console.error("❌ ERROR /call:", error.message);
    res.status(500).send("Error: " + error.message);
  }
});

function buildVoiceTwiml() {
  return `
<Response>
  <Connect>
    <Stream url="${process.env.BASE_URL.replace("https://", "wss://")}/media-stream" />
  </Connect>
</Response>
  `.trim();
}

app.get("/voice", (req, res) => {
  console.log("GET /voice");
  res.type("text/xml");
  res.send(buildVoiceTwiml());
});

app.post("/voice", (req, res) => {
  console.log("POST /voice");
  res.type("text/xml");
  res.send(buildVoiceTwiml());
});

const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioWs) => {
  console.log("🟢 Twilio conectado a /media-stream");

  let streamSid = null;
  let openAiReady = false;
  let greeted = false;

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  openaiWs.on("open", () => {
    console.log("🤖 OpenAI conectado");

    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        voice: "marin",
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        instructions: `
Eres la recepcionista de NESPED.

NESPED implanta sistemas de voz con IA para empresas.

Habla en español de España, de forma natural, cercana y profesional.
No hables demasiado.
Haz una sola pregunta cada vez.
No inventes datos.

Tu objetivo es:
- entender qué quiere la persona
- recoger nombre
- recoger teléfono
- recoger necesidad
- recoger ciudad si la menciona
- recoger preferencia horaria si la menciona

Cuando ya tengas nombre + teléfono + necesidad:
usa la herramienta guardar_lead.

Después confirma:
"Perfecto, hemos registrado tu solicitud. El equipo de NESPED te contactará lo antes posible."
        `,
        tools: [
          {
            type: "function",
            name: "guardar_lead",
            description: "Guardar lead en sistema",
            parameters: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                telefono: { type: "string" },
                necesidad: { type: "string" },
                ciudad: { type: "string" },
                preferencia: { type: "string" },
              },
              required: ["nombre", "telefono", "necesidad"],
            },
          },
        ],
        tool_choice: "auto",
      },
    };

    openaiWs.send(JSON.stringify(sessionUpdate));
    console.log("⚙️ session.update enviado");
  });

  twilioWs.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.event === "start") {
        streamSid = data.start?.streamSid || null;
        console.log("📞 Stream iniciado:", streamSid);
      }

      if (data.event === "media") {
        if (openAiReady && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: data.media.payload,
            })
          );
        }
      }

      if (data.event === "stop") {
        console.log("🔴 Twilio stop recibido");
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje de Twilio:", err.message);
    }
  });

  openaiWs.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());

      if (event.type === "error") {
        console.error("❌ OPENAI ERROR COMPLETO:", JSON.stringify(event, null, 2));
        return;
      }

      console.log("OpenAI event:", event.type);

      if (event.type === "session.updated") {
        openAiReady = true;
        console.log("✅ OpenAI listo");

        if (!greeted) {
          greeted = true;
          openaiWs.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Saluda como NESPED de forma natural y pregunta en qué puedes ayudar.",
              },
            })
          );
          console.log("👋 response.create enviado para saludo");
        }
      }

      if (event.type === "response.audio.delta" && event.delta && streamSid) {
        twilioWs.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: {
              payload: event.delta,
            },
          })
        );
      }

      if (
        event.type === "response.output_item.done" &&
        event.item?.type === "function_call"
      ) {
        const args = JSON.parse(event.item.arguments || "{}");
        console.log("💾 Guardando lead:", args);

        try {
          const webhookRes = await fetch(process.env.N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fecha: new Date().toISOString(),
              nombre: args.nombre || "",
              telefono: args.telefono || "",
              necesidad: args.necesidad || "",
              ciudad: args.ciudad || "",
              preferencia: args.preferencia || "",
              origen: "llamada_nesped",
            }),
          });

          const webhookText = await webhookRes.text();
          console.log("📨 n8n status:", webhookRes.status);
          console.log("📨 n8n response:", webhookText);

          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.item.call_id,
                output: JSON.stringify({ ok: true }),
              },
            })
          );

          openaiWs.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Confirma que la solicitud ha quedado registrada y que el equipo de NESPED contactará pronto.",
              },
            })
          );
        } catch (err) {
          console.error("❌ Error enviando lead a n8n:", err.message);
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje de OpenAI:", err.message);
    }
  });

  twilioWs.on("close", () => {
    console.log("🔌 Twilio desconectado");
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  openaiWs.on("close", () => {
    console.log("🔌 OpenAI desconectado");
  });

  openaiWs.on("error", (err) => {
    console.error("❌ Error WS OpenAI:", err.message);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 NESPED Voice Server en puerto ${PORT}`);
});