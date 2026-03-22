require("dotenv").config({ path: ".env.local" });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);

const accountSid =
  process.env.ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const authToken =
  process.env.AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const twilioNumber =
  process.env.TWILIO_NUMERO || process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !twilioNumber || !process.env.BASE_URL) {
  console.error("❌ Faltan variables de entorno importantes");
}

const client = twilio(accountSid, authToken);

app.get("/", (req, res) => {
  res.send("NESPED Voice Server activo");
});

app.get("/call", async (req, res) => {
  try {
    const call = await client.calls.create({
      to: process.env.TU_NUMERO,
      from: twilioNumber,
      url: `${process.env.BASE_URL}/voice`,
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
  const streamUrl = `${process.env.BASE_URL.replace("https://", "wss://")}/media-stream`;
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
  try {
    console.log("GET /voice");
    const xml = buildVoiceTwiml();
    console.log("📄 XML:", xml);
    res.type("text/xml");
    res.send(xml);
  } catch (error) {
    console.error("❌ ERROR GET /voice:", error.message);
    res.status(500).send("Error");
  }
});

app.post("/voice", (req, res) => {
  try {
    console.log("POST /voice");
    const xml = buildVoiceTwiml();
    console.log("📄 XML:", xml);
    res.type("text/xml");
    res.send(xml);
  } catch (error) {
    console.error("❌ ERROR POST /voice:", error.message);
    res.status(500).send("Error");
  }
});

const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioWs, req) => {
  console.log("🟢 Twilio conectado a /media-stream");
  console.log("🔗 URL recibida:", req.url);

  twilioWs.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      console.log("Twilio event:", data.event);
    } catch (err) {
      console.error("❌ Error procesando mensaje WS:", err.message);
    }
  });

  twilioWs.on("close", () => {
    console.log("🔌 Twilio desconectado");
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Error WS Twilio:", err.message);
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