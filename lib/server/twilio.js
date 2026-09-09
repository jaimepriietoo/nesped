import crypto from "crypto";
import { conCortacircuitos, noEsDelProveedor } from "@/lib/server/cortacircuitos";

/**
 * Twilio: el teléfono y la mensajería de Nesped.
 *
 * Sustituye a Telnyx, que llevaba el número, los SMS y los WhatsApp. El cambio
 * viene de la decisión de que la conversación la lleve ElevenLabs Agents, que
 * tiene integración nativa con Twilio: se le da el número y ElevenLabs se
 * encarga del audio de la llamada entera. Nesped deja de tener que puentear
 * media en tiempo real y sólo pone las herramientas HTTP y el webhook final.
 *
 * LO QUE NO CAMBIA respecto a Telnyx, porque estaba bien:
 *
 *  · Todo pasa por una sola función, y por eso el cortacircuitos va ahí. Si
 *    Twilio se cae, la cola y los automatismos reintentan, y cada reintento es
 *    una petición más contra un servicio caído, facturada igual.
 *  · Un 4xx que no sea 429 NO cuenta como caída. Un número mal escrito hace
 *    que Twilio conteste 400, y contarlo abriría el circuito por datos malos:
 *    un solo contacto con el teléfono mal metido dejaría a toda la plataforma
 *    sin mandar mensajes.
 *  · Quien manda dice si hay una persona esperando. Con alguien delante se
 *    intenta aunque el circuito esté abierto.
 */

function limpio(valor = "") {
  return String(valor || "").trim();
}

export function normalizePhone(value = "") {
  return limpio(value).replace(/[^\d+]/g, "");
}

export function getTwilioConfig() {
  return {
    accountSid: limpio(process.env.TWILIO_ACCOUNT_SID),
    authToken: limpio(process.env.TWILIO_AUTH_TOKEN),
    phoneNumber: normalizePhone(process.env.TWILIO_PHONE_NUMBER || ""),
    /* El de WhatsApp va aparte: Twilio lo expone como "whatsapp:+34…" y suele
       ser un número distinto del de voz. */
    whatsappNumber: normalizePhone(process.env.TWILIO_WHATSAPP_NUMBER || ""),
  };
}

export function hasTwilioSmsConfig() {
  const c = getTwilioConfig();
  return Boolean(c.accountSid && c.authToken && c.phoneNumber);
}

export function hasTwilioWhatsAppConfig() {
  const c = getTwilioConfig();
  return Boolean(c.accountSid && c.authToken && (c.whatsappNumber || c.phoneNumber));
}

/**
 * Toda llamada a Twilio pasa por aquí, y por eso el cortacircuitos va aquí.
 *
 * @param quienEspera "persona" cuando alguien está mirando la pantalla ahora
 *   —el SMS del segundo factor—; "nadie" para trabajos de fondo.
 */
async function pedirATwilio(ruta, campos, { quienEspera = "nadie" } = {}) {
  const { accountSid, authToken } = getTwilioConfig();

  if (!accountSid || !authToken) {
    throw new Error("Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN");
  }

  return conCortacircuitos({ proveedor: "twilio", quienEspera }, async () => {
    const respuesta = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}${ruta}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(campos).toString(),
        /* Con techo: una petición colgada bloquearía el trabajo hasta que la
           cola lo diera por perdido. */
        signal: AbortSignal.timeout(30_000),
      }
    );

    const json = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) return json;

    const error = new Error(
      json?.message || json?.detail || `Twilio devolvió ${respuesta.status}`
    );
    error.estado = respuesta.status;
    /* Twilio numera sus errores; el código dice mucho más que el texto y es lo
       que se busca en su documentación. */
    error.codigoTwilio = json?.code || null;

    if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 429) {
      throw noEsDelProveedor(error);
    }

    throw error;
  });
}

/**
 * Manda un SMS.
 *
 * El parámetro es `text` y no `message`. Se dice aquí porque el respaldo del
 * segundo factor pasó durante meses `message` a la función equivalente de
 * Telnyx, que esperaba `text`: el texto llegaba vacío, saltaba la comprobación
 * de "faltan datos" y ese respaldo no podía enviar nada, nunca, sin que nada
 * lo dijera.
 */
export async function enviarSms({ to, text, from, quienEspera = "nadie" } = {}) {
  const config = getTwilioConfig();
  const remitente = normalizePhone(from || config.phoneNumber);
  const destino = normalizePhone(to);
  const cuerpo = String(text || "").trim();

  if (!remitente || !destino || !cuerpo) {
    throw new Error("Faltan datos para enviar SMS con Twilio");
  }

  return pedirATwilio(
    "/Messages.json",
    { From: remitente, To: destino, Body: cuerpo },
    { quienEspera }
  );
}

/**
 * Manda un WhatsApp.
 *
 * Twilio quiere los números con el prefijo `whatsapp:`. Se pone aquí y no en
 * quien llama, para que nadie tenga que acordarse.
 */
export async function enviarWhatsApp({ to, text, from, quienEspera = "nadie" } = {}) {
  const config = getTwilioConfig();
  const remitente = normalizePhone(from || config.whatsappNumber || config.phoneNumber);
  const destino = normalizePhone(to);
  const cuerpo = String(text || "").trim();

  if (!remitente || !destino || !cuerpo) {
    throw new Error("Faltan datos para enviar WhatsApp con Twilio");
  }

  return pedirATwilio(
    "/Messages.json",
    { From: `whatsapp:${remitente}`, To: `whatsapp:${destino}`, Body: cuerpo },
    { quienEspera }
  );
}

/**
 * Comprueba que un webhook viene de Twilio de verdad.
 *
 * Twilio firma con HMAC-SHA1 sobre la URL completa más los campos del cuerpo
 * ordenados por nombre y concatenados. Es su esquema, no uno elegido aquí.
 *
 * La comparación es en tiempo constante: comparar firmas con === filtra
 * información sobre cuántos caracteres coinciden.
 */
export function verificarWebhookTwilio({
  url = "",
  params = {},
  signature = "",
  authToken = process.env.TWILIO_AUTH_TOKEN || "",
} = {}) {
  const token = limpio(authToken);
  const firma = limpio(signature);

  if (!token || !firma || !url) return false;

  const cadena = Object.keys(params)
    .sort()
    .reduce((acc, clave) => acc + clave + String(params[clave] ?? ""), limpio(url));

  const esperada = crypto.createHmac("sha1", token).update(Buffer.from(cadena, "utf8")).digest("base64");

  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** Lo que interesa de un webhook de mensajería entrante. */
export function leerWebhookDeMensajeria(campos = {}) {
  const quitarPrefijo = (v) => normalizePhone(String(v || "").replace(/^whatsapp:/i, ""));

  return {
    id: limpio(campos.MessageSid || campos.SmsSid),
    from: quitarPrefijo(campos.From),
    to: quitarPrefijo(campos.To),
    text: limpio(campos.Body),
    canal: /^whatsapp:/i.test(String(campos.From || "")) ? "whatsapp" : "sms",
    estado: limpio(campos.SmsStatus || campos.MessageStatus),
  };
}

export const PARA_PRUEBAS = { pedirATwilio };
