import { allowedOrigins } from "@/lib/server/request-policy";

export function urlDeSitio(req) {
  const allowed = allowedOrigins();
  try {
    const origin = new URL(req.url).origin;
    if (allowed.has(origin)) return origin;
  } catch {}
  return process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : "https://nesped.com";
}
