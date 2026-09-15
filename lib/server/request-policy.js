import net from "node:net";

export function allowedOrigins(env = process.env) {
  const values = [env.NEXT_PUBLIC_APP_URL, ...(env.NESPED_ALLOWED_ORIGINS || "").split(",")];
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL) values.push(`https://${env.VERCEL_URL}`);
  if (env.NODE_ENV !== "production") values.push("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3100", "http://127.0.0.1:3100");
  return new Set(values.filter(Boolean).flatMap(value => {
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" || (env.NODE_ENV !== "production" && url.protocol === "http:") ? [url.origin] : [];
    } catch { return []; }
  }));
}

export function isSameOriginRequest(req, env = process.env) {
  const allowed = allowedOrigins(env);
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origin && !referer) return false;
  return [origin, referer].filter(Boolean).every(value => {
    try { return allowed.has(new URL(value).origin); } catch { return false; }
  });
}

export function getRequestIp(req, env = process.env) {
  // Vercel sobrescribe esta cabecera. No confiar en cf-connecting-ip enviado
  // directamente por el visitante. Fuera de Vercel hace falta un proxy propio.
  if (env.VERCEL !== "1") return "unknown";
  const ip = (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-forwarded-for") || "").trim();
  return net.isIP(ip) ? ip : "unknown";
}
