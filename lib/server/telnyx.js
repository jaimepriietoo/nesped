import crypto from "crypto";

function toTrimmed(value = "") {
  return String(value || "").trim();
}

export function normalizePhone(value = "") {
  return toTrimmed(value).replace(/[^\d+]/g, "");
}

export function getTelnyxApiKey() {
  return toTrimmed(process.env.TELNYX_API_KEY);
}

export function getTelnyxVoiceConfig() {
  return {
    apiKey: getTelnyxApiKey(),
    accountSid: toTrimmed(process.env.TELNYX_ACCOUNT_SID),
    applicationId: toTrimmed(
      process.env.TELNYX_TEXML_APPLICATION_ID ||
        process.env.TELNYX_APPLICATION_SID
    ),
    phoneNumber: normalizePhone(process.env.TELNYX_PHONE_NUMBER || ""),
    webhookSecret: toTrimmed(process.env.TELNYX_WEBHOOK_SECRET),
  };
}

export function hasTelnyxVoiceConfig() {
  const config = getTelnyxVoiceConfig();
  return Boolean(
    config.apiKey &&
      config.accountSid &&
      config.applicationId &&
      config.phoneNumber
  );
}

export function getTelnyxSmsConfig() {
  return {
    apiKey: getTelnyxApiKey(),
    from: normalizePhone(
      process.env.TELNYX_SMS_NUMBER || process.env.TELNYX_PHONE_NUMBER || ""
    ),
  };
}

export function hasTelnyxSmsConfig() {
  const config = getTelnyxSmsConfig();
  return Boolean(config.apiKey && config.from);
}

export function getTelnyxWhatsAppConfig() {
  return {
    apiKey: getTelnyxApiKey(),
    from: normalizePhone(
      process.env.TELNYX_WHATSAPP_NUMBER ||
        process.env.TELNYX_PHONE_NUMBER ||
        ""
    ),
  };
}

export function hasTelnyxWhatsAppConfig() {
  const config = getTelnyxWhatsAppConfig();
  return Boolean(config.apiKey && config.from);
}

function buildTelnyxWebhookUrl(raw = "") {
  const value = toTrimmed(raw);
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const baseUrl = toTrimmed(
    process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || ""
  ).replace(/\/+$/, "");

  if (!baseUrl) return value;
  return `${baseUrl}/${value.replace(/^\/+/, "")}`;
}

async function sendTelnyxRequest(path, payload) {
  const apiKey = getTelnyxApiKey();
  if (!apiKey) {
    throw new Error("Falta TELNYX_API_KEY");
  }

  const response = await fetch(`https://api.telnyx.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      json?.errors?.[0]?.detail ||
        json?.error ||
        json?.message ||
        `Telnyx error ${response.status}`
    );
  }

  return json?.data || json;
}

export async function sendTelnyxSms({
  to,
  text,
  from,
  webhookUrl = "",
  webhookFailoverUrl = "",
} = {}) {
  const config = getTelnyxSmsConfig();
  const sender = normalizePhone(from || config.from);
  const receiver = normalizePhone(to);
  const body = {
    from: sender,
    to: receiver,
    text: String(text || "").trim(),
  };

  if (!sender || !receiver || !body.text) {
    throw new Error("Faltan datos para enviar SMS con Telnyx");
  }

  const resolvedWebhookUrl = buildTelnyxWebhookUrl(webhookUrl);
  const resolvedFailoverUrl = buildTelnyxWebhookUrl(webhookFailoverUrl);

  if (resolvedWebhookUrl) body.webhook_url = resolvedWebhookUrl;
  if (resolvedFailoverUrl) body.webhook_failover_url = resolvedFailoverUrl;

  return sendTelnyxRequest("/v2/messages", body);
}

export async function sendTelnyxWhatsApp({
  to,
  text,
  from,
  webhookUrl = "",
  webhookFailoverUrl = "",
} = {}) {
  const config = getTelnyxWhatsAppConfig();
  const sender = normalizePhone(from || config.from);
  const receiver = normalizePhone(to);
  const body = {
    from: sender,
    to: receiver,
    whatsapp_message: {
      type: "text",
      text: {
        body: String(text || "").trim(),
        preview_url: false,
      },
    },
  };

  if (!sender || !receiver || !body.whatsapp_message.text.body) {
    throw new Error("Faltan datos para enviar WhatsApp con Telnyx");
  }

  const resolvedWebhookUrl = buildTelnyxWebhookUrl(webhookUrl);
  const resolvedFailoverUrl = buildTelnyxWebhookUrl(webhookFailoverUrl);

  if (resolvedWebhookUrl) body.webhook_url = resolvedWebhookUrl;
  if (resolvedFailoverUrl) body.webhook_failover_url = resolvedFailoverUrl;

  return sendTelnyxRequest("/v2/messages/whatsapp", body);
}

function asPemPublicKey(value = "") {
  const normalized = toTrimmed(value);
  if (!normalized) return "";

  if (normalized.includes("BEGIN PUBLIC KEY")) {
    return normalized;
  }

  const wrapped = normalized.match(/.{1,64}/g)?.join("\n") || normalized;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

export function verifyTelnyxWebhook({
  payload = "",
  signature = "",
  timestamp = "",
  publicKey = process.env.TELNYX_PUBLIC_KEY || "",
  toleranceMs = 5 * 60 * 1000,
} = {}) {
  const pem = asPemPublicKey(publicKey);
  const sig = toTrimmed(signature);
  const ts = toTrimmed(timestamp);

  if (!pem || !sig || !ts) {
    return false;
  }

  const now = Date.now();
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > toleranceMs) {
    return false;
  }

  try {
    const verifierPayload = Buffer.from(`${ts}|${payload}`);
    const signatureBuffer = Buffer.from(sig, "base64");
    const key = crypto.createPublicKey(pem);
    return crypto.verify(null, verifierPayload, key, signatureBuffer);
  } catch {
    return false;
  }
}

export function parseTelnyxMessagingWebhook(input = {}) {
  const eventType = String(input?.data?.event_type || "").trim();
  const payload = input?.data?.payload || {};
  const firstTo = Array.isArray(payload?.to) ? payload.to[0] || {} : payload?.to || {};

  return {
    id: String(input?.data?.id || payload?.id || "").trim(),
    eventType,
    channel: String(payload?.type || "").trim().toLowerCase(),
    text: String(payload?.text || "").trim(),
    from: normalizePhone(payload?.from?.phone_number || payload?.from || ""),
    to: normalizePhone(firstTo?.phone_number || firstTo || ""),
    occurredAt: input?.data?.occurred_at || null,
    payload,
    raw: input,
  };
}
