/**
 * Comprobación de las pantallas de administración.
 *
 *   ADMIN_EMAIL=... node scripts/revisar-admin.mjs
 *
 * Entra firmando la cookie de sesión con el mismo secreto que la aplicación,
 * en vez de pasar por el formulario. Los roles de administración exigen un
 * código de verificación por correo, y esperar a un email hace imposible
 * automatizar esta revisión.
 *
 * Sólo para desarrollo: necesita .env.local, así que no funciona contra
 * producción ni desde ninguna máquina que no sea la del proyecto.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3100";
const EMAIL = process.env.ADMIN_EMAIL;
const CLIENT_ID = process.env.ADMIN_CLIENT_ID || "demo";
const ROL = process.env.ADMIN_ROLE || "admin";
const CAPTURAS = process.env.CAPTURAS || "";

if (!EMAIL) {
  console.error("Falta ADMIN_EMAIL.");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

// Mismo orden de preferencia que lib/server/auth.js.
const secreto =
  env.NESPED_SESSION_SECRET || env.INTERNAL_API_TOKEN || env.CRON_SECRET ||
  env.SUPABASE_SERVICE_ROLE_KEY || "nesped-dev-secret";

const ahora = Date.now();
const cuerpo = Buffer.from(JSON.stringify({
  email: EMAIL.toLowerCase(),
  clientId: CLIENT_ID,
  role: ROL,
  issuedAt: ahora,
  expiresAt: ahora + 60 * 60 * 1000,
})).toString("base64url");
const token = `${cuerpo}.${crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url")}`;

const dominio = new URL(BASE).hostname;
const galleta = (name, value) => ({ name, value, domain: dominio, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });

const nav = await chromium.launch({ channel: "chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addCookies([
  galleta("nesped_session", token),
  galleta("nesped_auth", "ok"),
  galleta("nesped_client_id", CLIENT_ID),
  galleta("nesped_client_name", CLIENT_ID),
  galleta("nesped_role", ROL),
  galleta("nesped_user_email", EMAIL.toLowerCase()),
]);

const PANTALLAS = [
  { ruta: "/admin", nombre: "panel" },
  { ruta: "/admin/overview", nombre: "resumen" },
  { ruta: "/admin/clients", nombre: "clientes" },
  { ruta: "/admin/domains", nombre: "dominios" },
];

let fallos = 0;
console.log(`Revisando administración en ${BASE}\n`);

for (const p of PANTALLAS) {
  const pag = await ctx.newPage();
  const errores = [];
  pag.on("pageerror", (e) => errores.push(`JS: ${e.message.slice(0, 90)}`));
  pag.on("console", (m) => { if (m.type() === "error") errores.push(`consola: ${m.text().slice(0, 90)}`); });

  const res = await pag.goto(BASE + p.ruta, { waitUntil: "domcontentloaded", timeout: 40000 });
  await pag.waitForTimeout(5500);

  const m = await pag.evaluate(() => ({
    url: location.pathname,
    alto: document.documentElement.scrollHeight,
    texto: document.body.innerText.trim().length,
    desborda: document.documentElement.scrollWidth > window.innerWidth + 1,
    barra: Boolean(document.querySelector(".adm-top")),
    enlaces: document.querySelectorAll(".adm-link").length,
  }));

  const mal = [];
  if (m.url !== p.ruta) mal.push(`redirigido a ${m.url}: ¿la sesión no vale?`);
  if (res.status() >= 400) mal.push(`HTTP ${res.status()}`);
  if (m.texto < 200) mal.push(`sólo ${m.texto} caracteres`);
  if (m.desborda) mal.push("barra de scroll horizontal");
  if (!m.barra) mal.push("sin la barra de navegación común");
  if (m.enlaces !== 4) mal.push(`${m.enlaces} enlaces en el menú, se esperaban 4`);
  mal.push(...errores);
  fallos += mal.length;

  if (CAPTURAS) await pag.screenshot({ path: `${CAPTURAS}/admin-${p.nombre}.png`, fullPage: true });

  console.log(`${mal.length ? "✗" : "✓"} ${p.ruta.padEnd(20)} ${String(m.alto).padStart(5)}px ${String(m.texto).padStart(5)} chars` +
    (mal.length ? `\n    → ${mal.join("\n    → ")}` : ""));
  await pag.close();
}

await nav.close();
console.log(fallos === 0 ? "\n✓ Sin incidencias." : `\n✗ ${fallos} incidencia(s).`);
process.exit(fallos === 0 ? 0 : 1);
