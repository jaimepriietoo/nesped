const PRIVATE_FIELD = /authorization|cookie|token|secret|password|api[_-]?key|dsn|email|correo|phone|telefono|ip_address|forwarded.?for|transcript|recording|grabacion|otp|recovery|request.?body/i;

export function redactText(value) {
  let text = String(value);
  for (const [key, secret] of Object.entries(process.env)) {
    if (/secret|token|password|api_?key|service_role/i.test(key) && secret && secret.length >= 12) {
      text = text.split(secret).join("[redacted]");
    }
  }
  return text
    .replace(/https?:\/\/[^\s"<>]+/g, raw => {
      try { const url = new URL(raw); return url.origin + url.pathname; } catch { return "[url]"; }
    })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+\d[\d ()-]{7,}\d/g, "[phone]")
    .slice(0, 8000);
}

export function redactData(value, depth = 0) {
  if (depth > 6) return "[redacted:depth]";
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 40).map(item => redactData(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    key, PRIVATE_FIELD.test(key) ? "[redacted]" : redactData(item, depth + 1),
  ]));
}
