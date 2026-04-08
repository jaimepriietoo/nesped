require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const { createClient } = require("@supabase/supabase-js");

console.log("VOICE SERVER ENTERPRISE FINAL - 2026-04-07");
console.log("OPENAI_API_KEY presente:", !!process.env.OPENAI_API_KEY);
console.log("BASE_URL:", process.env.BASE_URL);
console.log("PORT:", process.env.PORT);

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

function getFallbackPrompt() {
  return `
Eres un asistente telefónico humano, natural y profesional. No pareces una IA. Suenas como una persona real hablando por teléfono.

Hablas en español de forma cercana, relajada y natural. Usas frases cortas, tono humano y expresiones reales.

Tu objetivo es:
1. atender la llamada
2. entender qué necesita el usuario
3. recoger sus datos si hay interés
4. cerrar la conversación de forma natural y terminar

ESTILO:
- Hablas como una persona real
- Usas expresiones naturales como "vale", "perfecto", "genial", "entiendo", "claro", "sin problema"
- No hablas demasiado seguido
- No usas frases largas
- No explicas de más
- No suenas formal ni técnico
- No haces listas largas
- No das respuestas tipo chatbot

COMPORTAMIENTO:
- Saluda de forma breve y natural
- Haz solo una pregunta cada vez
- No interrumpas
- Si el usuario tiene interés, recoge los datos rápido y con naturalidad
- Si no sabes algo, dilo de forma natural y ofrece que el equipo contacte después

RUIDO:
- Ignora toses, carraspeos, respiraciones, golpes, ruidos de fondo y sonidos cortos
- No respondas a sonidos sueltos
- No cambies de tema por ruido
- Si no has entendido bien, pide repetirlo de forma natural
- Si no hay una frase clara del usuario, no respondas

RITMO:
- Espera a que la persona termine claramente
- No respondas a pausas cortas
- Si la frase queda a medias, espera
- No te precipites

CAPTURA DE LEAD:
Recoge, de forma natural:
- nombre
- teléfono
- necesidad

Opcional:
- ciudad
- preferencia
- urgencia

No pidas todo de golpe.

Cuando ya tengas como mínimo:
- nombre
- teléfono
- necesidad

usa la función guardar_lead.

CIERRE:
Después de guardar el lead o cerrar la consulta, di una frase breve y natural como:
- "Perfecto, ya lo tengo todo apuntado, te contactan en breve"
- "Genial, queda registrado y te dicen algo pronto"
- "Vale, todo listo, te contactan enseguida"

Después de eso:
- no hagas más preguntas
- no alargues la conversación
- no sigas hablando
`.trim();
}

async function getClientConfig(clientId) {
  if (!supabase) {
    return {
      id: clientId || "demo",
      name: "NESPED Demo",
      prompt: getFallbackPrompt(),
      webhook: "",
      twilioNumber: fallbackTwilioNumber,
    };
  }

  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (error || !data) {
      console.error(
        "❌ Error cargando client config:",
        error?.message || "sin data"
      );

      return {
        id: clientId || "demo",
        name: "NESPED Demo",
        prompt: getFallbackPrompt(),
        webhook: "",
        twilioNumber: fallbackTwilioNumber,
      };
    }

    return {
      id: data.id,
      name: data.name || "Cliente",
      prompt: data.prompt || getFallbackPrompt(),
      webhook: data.webhook || "",
      twilioNumber: data.twilio_number || fallbackTwilioNumber,
    };
  } catch (err) {
    console.error("❌ Excepción cargando client config:", err.message);

    return {
      id: clientId || "demo",
      name: "NESPED Demo",
      prompt: getFallbackPrompt(),
      webhook: "",
      twilioNumber: fallbackTwilioNumber,
    };
  }
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
  const streamUrl = `${cleanBaseUrl.replace(
    "https://",
    "wss://"
  )}/media-stream?client_id=${clientId}`;

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
console.log("✅ WebSocket /media-stream listo");

wss.on("connection", async (twilioWs, req) => {
  const url = new URL(req.url, "https://dummy");
  const clientId = url.searchParams.get("client_id") || "demo";

  console.log("🟢 Twilio conectado a /media-stream");
  console.log("🔥 Cliente WS:", clientId);

  const config = await getClientConfig(clientId);

  if (!config) {
    console.error("❌ No hay config, cerrando conexión:", clientId);
    twilioWs.close();
    return;
  }

  let streamSid = null;
  let callSid = null;
  let greeted = false;
  let leadCaptured = false;
  let callStartedAt = Date.now();
  let fromNumber = "";
  let toNumber = "";
  let transcriptParts = [];
  let callSummary = "Llamada atendida";
  let closingRequested = false;
  let callSaved = false;

  let totalMediaChunks = 0;
  let speechStartChunk = null;
  let lastUtteranceChunks = 0;
  let noiseResponseGuard = false;
  let pendingHangup = null;

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  console.log("🔄 Intentando conectar con OpenAI realtime...");

  function addTranscriptLine(line) {
    if (!line) return;
    transcriptParts.push(line);
    if (transcriptParts.length > 400) {
      transcriptParts = transcriptParts.slice(-400);
    }
  }

  async function saveCall(status = "completed") {
    if (callSaved) return;
    callSaved = true;

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
        ai_spoke: true,
        call_outcome: leadCaptured
          ? "lead_captured"
          : "completed_without_lead",
        detected_intent: leadCaptured ? "captacion" : "consulta",
        summary_long: transcript
          ? `Resumen automático: ${callSummary}. Transcripción disponible para análisis.`
          : callSummary,
      });

      console.log("📞 Llamada guardada en Supabase");
    } catch (err) {
      console.error("❌ Error guardando llamada:", err.message);
    }
  }

  async function saveLeadToSupabase(args) {
    if (!supabase) {
      console.log("⚠️ saveLead omitido porque Supabase está desactivado");
      return null;
    }

    try {
      const nombre = args.nombre || "";
      const telefono = args.telefono || "";
      const ciudad = args.ciudad || "";
      const necesidad = args.necesidad || "";
      const preferencia = args.preferencia || "";

      let score = 0;

      try {
        const { data: scoreValue, error: scoreError } = await supabase.rpc(
          "calculate_lead_score",
          {
            p_nombre: nombre,
            p_telefono: telefono,
            p_necesidad: necesidad,
            p_ciudad: ciudad || null,
          }
        );

        if (!scoreError && typeof scoreValue === "number") {
          score = scoreValue;
        }
      } catch (err) {
        console.error("❌ Error calculando score:", err.message);
      }

      const interes =
        score >= 80 ? "alto" : score >= 50 ? "medio" : "bajo";

      const tags = [
        "llamada_ia",
        necesidad ? "necesidad_detectada" : null,
        ciudad ? `ciudad:${ciudad}` : null,
        preferencia ? `preferencia:${preferencia}` : null,
        interes ? `interes:${interes}` : null,
      ].filter(Boolean);

      const resumen = [
        nombre ? `${nombre}` : "Lead sin nombre",
        necesidad ? `necesita ${necesidad}` : null,
        ciudad ? `en ${ciudad}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const { data: insertedLead, error } = await supabase
        .from("leads")
        .insert({
          client_id: clientId,
          nombre,
          telefono,
          ciudad,
          necesidad,
          origen: `llamada_${clientId}`,
          fuente: "llamada_ia",
          score,
          status: "new",
          tags,
          ultima_accion: "Lead capturado por la IA en llamada",
          proxima_accion: "Contactar al lead lo antes posible",
          interes,
          resumen,
          notes: preferencia || null,
        })
        .select()
        .single();

      if (error) {
        console.error("❌ Error guardando lead en Supabase:", error.message);
        return null;
      }

      console.log("✅ Lead guardado en Supabase");

      try {
        const { error: eventError } = await supabase.from("lead_events").insert({
          lead_id: insertedLead.id,
          client_id: clientId,
          type: "lead_created",
          title: "Lead creado automáticamente",
          description: `Lead capturado por llamada. Nombre: ${nombre || "-"} · Teléfono: ${telefono || "-"} · Necesidad: ${necesidad || "-"}`,
          meta: {
            origen: `llamada_${clientId}`,
            score,
            interes,
            preferencia,
          },
        });

        if (eventError) {
          console.error("❌ Error guardando evento de lead:", eventError.message);
        } else {
          console.log("✅ Evento de lead guardado");
        }
      } catch (err) {
        console.error("❌ Excepción guardando evento de lead:", err.message);
      }

      return insertedLead;
    } catch (err) {
      console.error("❌ Excepción guardando lead:", err.message);
      return null;
    }
  }

  function requestClosingResponse(text) {
    if (closingRequested || openaiWs.readyState !== WebSocket.OPEN) return;
    closingRequested = true;

    openaiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: text,
        },
      })
    );
  }

  function endCallSoon() {
    console.log("📴 Cerrando llamada...");

    try {
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.close();
      }
    } catch (err) {
      console.error("❌ Error cerrando Twilio WS:", err.message);
    }

    try {
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    } catch (err) {
      console.error("❌ Error cerrando OpenAI WS:", err.message);
    }
  }

  openaiWs.on("open", () => {
    console.log("🤖 OpenAI conectado para:", config.name);

    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          instructions: (config.prompt || getFallbackPrompt()).trim(),
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true,
            interrupt_response: true,
          },
          tools: [
            {
              type: "function",
              name: "guardar_lead",
              description:
                "Guardar un lead cuando ya tengas nombre, teléfono y necesidad del usuario.",
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

      if (data.event !== "media") {
        console.log("Twilio event:", data.event, JSON.stringify(data));
      }

      if (data.event === "start") {
        streamSid = data.start?.streamSid || data.streamSid || null;
        callSid = data.start?.callSid || null;
        fromNumber = data.start?.customParameters?.from || "";
        toNumber = data.start?.customParameters?.to || "";
        addTranscriptLine("[SYSTEM] Inicio de llamada");
        console.log("📞 Stream iniciado:", streamSid);
        console.log("📞 Call SID:", callSid);
      }

      if (data.event === "media") {
        totalMediaChunks += 1;

        if (!streamSid && data.streamSid) {
          streamSid = data.streamSid;
          console.log("📌 streamSid recuperado desde media:", streamSid);
        }

        if (openaiWs.readyState === WebSocket.OPEN) {
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
        await saveCall(leadCaptured ? "lead_captured" : "completed");

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
        console.log("✅ OpenAI listo");

        if (!greeted) {
          greeted = true;
          openaiWs.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Saluda de forma muy natural, breve y humana en español, como una persona real por teléfono, y pregunta en qué puedes ayudar.",
              },
            })
          );
          console.log("👋 response.create enviado");
        }
      }

      if (event.type === "input_audio_buffer.speech_started") {
        speechStartChunk = totalMediaChunks;
        noiseResponseGuard = false;
        console.log("🟢 speech_started");

        if (pendingHangup) {
          clearTimeout(pendingHangup);
          pendingHangup = null;
        }
      }

      if (event.type === "input_audio_buffer.speech_stopped") {
        if (speechStartChunk !== null) {
          lastUtteranceChunks = totalMediaChunks - speechStartChunk;
        } else {
          lastUtteranceChunks = 0;
        }

        noiseResponseGuard = lastUtteranceChunks < 45;

        console.log(
          `🟡 speech_stopped | chunks=${lastUtteranceChunks} | noiseGuard=${noiseResponseGuard}`
        );
      }

      if (event.type === "response.created" && noiseResponseGuard) {
        console.log("🚫 Cancelando respuesta por input demasiado corto/ruido");
        openaiWs.send(
          JSON.stringify({
            type: "response.cancel",
          })
        );
        return;
      }

      if (
        event.type === "response.audio.delta" ||
        event.type === "response.output_audio.delta"
      ) {
        if (noiseResponseGuard) {
          console.log("🚫 Audio descartado por noiseGuard");
          return;
        }

        if (!event.delta) {
          console.log("⚠️ Audio delta sin payload");
        } else if (!streamSid) {
          console.log("⚠️ Audio delta recibido pero no hay streamSid todavía");
        } else {
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
      }

      if (
        event.type === "response.audio.done" ||
        event.type === "response.output_audio.done"
      ) {
        console.log("✅ audio done recibido");
      }

      if (event.type === "response.done") {
        console.log("✅ response.done recibido");

        if (closingRequested) {
          pendingHangup = setTimeout(() => {
            endCallSoon();
          }, 1200);
        }
      }

      if (event.type === "response.cancelled") {
        console.log("⛔ response.cancelled recibido");
      }

      if (event.type === "response.text.delta" && event.delta) {
        addTranscriptLine(`[AI] ${event.delta}`);
      }

      if (event.type === "response.audio_transcript.delta" && event.delta) {
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

        const insertedLead = await saveLeadToSupabase(args);

        const leadName = args.nombre || "sin nombre";
        const leadNeed = args.necesidad || "sin necesidad";
        const leadScore = insertedLead?.score ?? 0;
        const leadInterest = insertedLead?.interes || "medio";

        callSummary = `Lead capturado: ${leadName} · ${leadNeed} · score ${leadScore} · interés ${leadInterest}`;

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

          requestClosingResponse(
            "Confirma de forma muy natural, breve y humana que ya está apuntado y que le contactarán en breve. Después termina completamente la conversación."
          );
          return;
        }

        try {
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
              score: leadScore,
              interes: leadInterest,
            }),
          });

          const webhookText = await webhookRes.text();
          console.log("📨 webhook status:", webhookRes.status);
          console.log("📨 webhook response:", webhookText);

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

          requestClosingResponse(
            "Confirma de forma muy natural, breve y humana que ya está registrado y que el equipo contactará pronto. Después termina completamente la conversación."
          );
        } catch (err) {
          console.error("❌ Error enviando lead al webhook:", err.message);

          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.item.call_id,
                output: JSON.stringify({ ok: false }),
              },
            })
          );

          requestClosingResponse(
            "Di de forma natural que ya está anotado y que lo revisarán enseguida. Después termina completamente la conversación."
          );
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje de OpenAI:", err.message);
    }
  });

  twilioWs.on("close", async () => {
    console.log("🔌 Twilio desconectado");
    await saveCall(leadCaptured ? "lead_captured" : "completed");

    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", async (err) => {
    console.error("❌ Error WS Twilio:", err.message);
    await saveCall("failed");
  });

  openaiWs.on("close", (code, reason) => {
    console.log("🔌 OpenAI desconectado");
    console.log("OpenAI close code:", code);
    console.log("OpenAI close reason:", reason?.toString());
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