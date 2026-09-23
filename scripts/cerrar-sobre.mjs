#!/usr/bin/env node
/**
 * Cierra un secreto en un sobre KMS para pegarlo en Vercel.
 *
 *   node --import ./tests/alias.mjs scripts/cerrar-sobre.mjs NOMBRE_DE_LA_VARIABLE
 *
 * Pide el valor por teclado (no por argumento, para que no quede en el
 * historial de la shell) y escribe el sobre `kms:v1:…`. Ese sobre va en
 * Vercel en la variable del mismo nombre; la app lo abre al arrancar.
 * Usa la cadena estándar de identidad de AWS (incluidos valores locales si
 * están configurados en .env.local).
 */
import fs from "node:fs";
import { preguntarSecreto } from "./entrada-secreta.mjs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const nombre = process.argv[2];
const { SECRETOS_EN_SOBRE, cerrarSobre, abrirSobre } = await import("@/lib/server/kms");
if (!nombre || !SECRETOS_EN_SOBRE.includes(nombre)) {
  console.error(`Uso: cerrar-sobre.mjs <variable>\nVariables admitidas:\n  ${SECRETOS_EN_SOBRE.join("\n  ")}`);
  process.exit(2);
}
let valor;
try {
  valor = (await preguntarSecreto(`Valor actual de ${nombre} (entrada oculta): `)).trim();
} catch (error) {
  if (error?.code === "NESPED_INPUT_CANCELLED") process.exit(130);
  throw error;
}
if (!valor) { console.error("Vacío."); process.exit(2); }

/* Un sobre bien cerrado con un valor equivocado deja el portal sin acceso a
   la base. Lo que se puede comprobar, se comprueba antes de cerrar. */
const { default: crypto } = await import("node:crypto");
const firmaJwt = (token, secreto) => {
  const [c, b] = String(token || "").split(".");
  return c && b ? crypto.createHmac("sha256", secreto).update(`${c}.${b}`).digest("base64url") : null;
};
if (nombre === "SUPABASE_JWT_SECRET") {
  /* El testigo tiene que ser un JWT (eyJ…): la publishable sb_… no sirve. */
  const esJwt = (t) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(t || ""));
  const testigo = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY].find(esJwt) || "";
  const firma = testigo.split(".")[2];
  if (!testigo) { console.error("No hay ninguna clave JWT (eyJ…) en .env.local con la que comprobar el secreto; no se cierra a ciegas."); process.exit(1); }
  if (firmaJwt(testigo, valor) !== firma) {
    console.error("Ese valor NO es el JWT secret de este proyecto: la clave anon de .env.local no está firmada con él.");
    console.error("Cópialo de Supabase → Project Settings → JWT Keys → Legacy JWT Secret → Reveal.");
    process.exit(1);
  }
}
if (nombre === "SUPABASE_SERVICE_ROLE_KEY" && !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(valor)) {
  console.error("La service role key es un JWT (empieza por eyJ…). Eso no lo es."); process.exit(1);
}
if (nombre === "STRIPE_SECRET_KEY" && !/^(sk|rk)_(live|test)_/.test(valor)) { console.error("Una clave de Stripe empieza por sk_live_ o sk_test_."); process.exit(1); }
if (nombre === "OPENAI_API_KEY" && !/^sk-/.test(valor)) { console.error("Una clave de OpenAI empieza por sk-."); process.exit(1); }
if (nombre === "RESEND_API_KEY" && !/^re_/.test(valor)) { console.error("Una clave de Resend empieza por re_."); process.exit(1); }
if (nombre === "TWILIO_AUTH_TOKEN" && !/^[a-f0-9]{32}$/.test(valor)) { console.error("El auth token de Twilio son 32 caracteres hexadecimales."); process.exit(1); }
if (nombre === "ELEVENLABS_API_KEY" && !/^(sk_|xi-)/.test(valor)) { console.error("Una clave de ElevenLabs empieza por sk_ o xi-."); process.exit(1); }
if (nombre === "NESPED_TOTP_ENCRYPTION_KEY" && !/^[a-f0-9]{64}$/i.test(valor)) { console.error("La clave TOTP son 64 caracteres hexadecimales."); process.exit(1); }
const sobre = await cerrarSobre(valor, { nombre });
const comprobado = await abrirSobre(sobre, { nombre });
if (comprobado !== valor) { console.error("El sobre no se abre con el mismo valor; no lo uses."); process.exit(1); }
console.error(`\nSobre cerrado y comprobado. Pega esto en Vercel como ${nombre}:\n`);
console.log(sobre);
