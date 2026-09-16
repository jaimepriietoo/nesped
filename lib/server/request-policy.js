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

/**
 * El origen al que llegó la petición, tal como lo ve el mundo: el host que
 * pone el proxy (x-forwarded-host en Vercel) con https. Se acepta además
 * de la lista de variables porque la lista puede no coincidir con el
 * dominio real —NEXT_PUBLIC_APP_URL con nesped.com y la gente entrando por
 * www.nesped.com— y entonces NADIE puede iniciar sesión. Un POST desde otra
 * web sigue trayendo su propio Origin, que no es este host, y se rechaza.
 */
export function requestOrigin(req, env = process.env) {
  /* Sólo detrás de Vercel, que reescribe x-forwarded-host con el dominio
     real: fuera de ahí la cabecera la pone quien llama y no vale de nada.
     Misma regla que getRequestIp. */
  if (env.VERCEL !== "1" && env.NODE_ENV === "production") return null;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  if (!host) return null;
  const proto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
  const esquema = proto || (env.NODE_ENV !== "production" ? "http" : "https");
  if (esquema !== "https" && env.NODE_ENV === "production") return null;
  try { return new URL(`${esquema}://${host}`).origin; } catch { return null; }
}

export function isSameOriginRequest(req, env = process.env) {
  const allowed = allowedOrigins(env);
  const propio = requestOrigin(req, env);
  if (propio) allowed.add(propio);
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
