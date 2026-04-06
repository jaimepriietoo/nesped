console.log("VOICE SERVER NUEVO - 2026-04-07 - FIX-1");

require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);

const accountSid =
  process.env.ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const authToken =
  process.env.AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const fallbackTwilioNumber =
  process.env.TWILIO_NUMERO || process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

const hasSupabase =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = hasSupabase
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

if (!hasSupabase) {
  console.log("⚠️ Supabase desactivado");
}

app.get("/", (req, res) => {
  res.send("NESPED Voice Server activo");
});

async function getClientConfig(clientId) {
  if (!supabase) {
    return {
      id: clientId || "demo",
      name: "Demo",
      prompt:
        "Habla en español, de forma natural, breve y clara. Eres un asistente telefónico útil. Responde siempre con voz.",
      webhook: "",
      twilioNumber: fallbackTwilioNumber,
    };
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error || !data) {
    console.error("❌ Error cargando client config:", error?.message || "sin data");
    return {
      id: clientId || "demo",
      name: "Demo",
      prompt:
        "Habla en español, de forma natural, breve y clara. Eres un asistente telefónico útil. Responde siempre con voz.",
      webhook: "",
      twilioNumber: fallbackTwilioNumber,
    };
  }

  return {
    id: data.id,
    name: data.name,
    prompt: data.prompt || "",
    webhook: data.webhook || "",
    twilioNumber: data.twilio_number || fallbackTwilioNumber,
  };
}

app.get("/call", async (req, res) => {
  try {
    const clientId = req.query.client_id || "demo";
    const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");

    const config = await getClientConfig(clientId);
    if (!config) {
      return res.status(404).send("Cliente no encontrado");
    }

    const call = await client.calls.create({
      to: process.env.TU_NUMERO,
      from: config.twilioNumber || fallbackTwilioNumber,
      url: `${cleanBaseUrl}/voice?client_id=${clientId}`,
      method: "POST",
    });

    console.log("📞 Llamada iniciada:", call.sid, "cliente:", clientId);
    res.send("Llamada iniciada: " + call.sid);
  } catch (error) {
    console.error("❌ ERROR /call:", error.message);
    res.status(500).send("Error: " + error.message);
  }
});

function buildVoiceTwiml(clientId) {
  const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");
  const streamUrl = `${cleanBaseUrl.replace("https://", "wss://")}/media-stream?client_id=${clientId}`;

  console.log("🌐 STREAM URL:", streamUrl);

  return `
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>
  `.trim();
}

app.get("/voice", (req, res) => {
  const clientId = req.query.client_id || "demo";
  console.log("GET /voice");
  console.log("🏢 Cliente detectado en /voice:", clientId);

  const xml = buildVoiceTwiml(clientId);
  res.type("text/xml");
  res.send(xml);
});

app.post("/voice", (req, res) => {
  const clientId = req.query.client_id || "demo";
  console.log("POST /voice");
  console.log("🏢 Cliente detectado en /voice:", clientId);

  const xml = buildVoiceTwiml(clientId);
  res.type("text/xml");
  res.send(xml);
});

const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", async (twilioWs, req) => {
  const url = new URL(req.url, "https://dummy");
  const clientId = url.searchParams.get("client_id") || "demo";

  console.log("🟢 Twilio conectado a /media-stream");
  console.log("🔥 Cliente WS:", clientId);

  const config = await getClientConfig(clientId);

  if (!config) {
  console.error("❌ No hay config, usando cierre defensivo:", clientId);
  twilioWs.close();
  return;
}

  let streamSid = null;
  let callSid = null;
  let openAiReady = false;
  let greeted = false;
  let callStartedAt = Date.now();
  let fromNumber = "";
  let toNumber = "";
  let leadCaptured = false;
  let callSummary = "Llamada atendida";
  let transcriptParts = [];

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  function addTranscriptLine(line) {
    if (!line) return;
    transcriptParts.push(line);
    if (transcriptParts.length > 200) {
      transcriptParts = transcriptParts.slice(-200);
    }
  }

 async function saveCall(status = "completed") {
  if (!supabase) {
    console.log("⚠️ saveCall omitido porque Supabase está desactivado");
    return;
  }

  try {
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - callStartedAt) / 1000)
    );

    const transcript = transcriptParts.join("\n").trim();

    await supabase.from("calls").insert({
      client_id: clientId,
      call_sid: callSid || null,
      from_number: fromNumber || "",
      to_number: toNumber || "",
      status,
      summary: callSummary,
      transcript,
      lead_captured: leadCaptured,
      duration_seconds: durationSeconds,
    });

    console.log("📞 Llamada guardada en Supabase");
  } catch (err) {
    console.error("❌ Error guardando llamada:", err.message);
  }
}

  openaiWs.on("open", () => {
    console.log("🤖 OpenAI conectado para:", config.name);

    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "marin",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          instructions: config.prompt,
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
  type: "server_vad",
  create_response: true,
},
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
      })
    );

    console.log("⚙️ session.update enviado");
  });

  twilioWs.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.event === "start") {
        streamSid = data.start?.streamSid || null;
        callSid = data.start?.callSid || null;
        fromNumber = data.start?.customParameters?.from || "";
        toNumber = data.start?.customParameters?.to || "";
        addTranscriptLine("[SYSTEM] Inicio de llamada");
        console.log("📞 Stream iniciado:", streamSid);
      }

      if (data.event === "media") {
  if (openaiWs.readyState === WebSocket.OPEN) {
    console.log("🎤 Audio recibido de Twilio");
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

      console.log("OpenAI event:", event.type);

      if (event.type === "error") {
        console.error("❌ OPENAI ERROR COMPLETO:", JSON.stringify(event, null, 2));
        return;
      }

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
                  "Saluda de forma natural en español y pregunta en qué puedes ayudar.",
              },
            })
          );
          console.log("👋 response.create enviado");
        }
      }

    if (event.type === "response.output_audio.delta" && event.delta && streamSid) {
  twilioWs.send(
    JSON.stringify({
      event: "media",
      streamSid,
      media: {
        payload: event.delta,
      },
    })
  );
  console.log("🔊 Audio enviado a Twilio");
}

      if (event.type === "response.text.delta" && event.delta) {
        addTranscriptLine(`[AI] ${event.delta}`);
      }

      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        event.transcript
      ) {
        addTranscriptLine(`[USER] ${event.transcript}`);
      }

      if (
        event.type === "response.output_item.done" &&
        event.item?.type === "function_call"
      ) {
        const args = JSON.parse(event.item.arguments || "{}");
        console.log("💾 Guardando lead:", args);

        leadCaptured = true;
        callSummary = `Lead capturado: ${args.nombre || "sin nombre"} · ${args.necesidad || "sin necesidad"}`;

        try {
          if (!config.webhook) {
  console.log("⚠️ Webhook no configurado, se omite guardar lead externo");

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
          "Confirma brevemente que la solicitud ha quedado registrada.",
      },
    })
  );

  return;
}
          
            const webhookRes = await fetch(config.webhook, {
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
              origen: `llamada_${clientId}`,
              cliente: clientId,
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
                  "Confirma que la solicitud ha quedado registrada y que el equipo contactará pronto.",
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

  twilioWs.on("close", async () => {
    console.log("🔌 Twilio desconectado");
    await saveCall("completed");

    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", async (err) => {
    console.error("❌ Error WS Twilio:", err.message);
    await saveCall("failed");
  });

  openaiWs.on("close", () => {
    console.log("🔌 OpenAI desconectado");
  });

  openaiWs.on("error", (err) => {
    console.error("❌ Error WS OpenAI:", err.message);
  });
});

process.on("uncaughtException", (err) => {
  console.error("❌ uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ unhandledRejection:", reason);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 NESPED Voice Server en puerto ${PORT}`);
});