/**
 * Recorre el portal entero con sesión real y comprueba cada vista.
 * Las credenciales llegan por variables de entorno; no se escriben aquí.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3100";
const SALIDA = process.env.SALIDA;

const nav = await chromium.launch({ channel: "chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 } });
const p = await ctx.newPage();

const errores = [];
p.on("pageerror", (e) => errores.push("ERROR: " + e.message.slice(0, 120)));
p.on("console", (m) => { if (m.type() === "error") errores.push("CONSOLA: " + m.text().slice(0, 120)); });

await p.goto(`${BASE}/login?next=/portal`, { waitUntil: "domcontentloaded" });
// El botón sólo se habilita cuando React ha hidratado: esa es la señal de que
// el onSubmit ya existe y el clic no va a provocar un envío nativo.
await p.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 30000 });

await p.fill("#v3-email", process.env.PORTAL_EMAIL);
await p.fill("#v3-pass", process.env.PORTAL_PASS);
await p.click('button[type="submit"]');
await p.waitForTimeout(4000);

// Con rol owner hace falta el segundo factor; en local sale como código de desarrollo.
const codigo = await p.evaluate(() => {
  const m = document.body.innerText.match(/Código de desarrollo:\s*(\d{6})/);
  return m ? m[1] : null;
});

if (codigo) {
  console.log(`2FA: código de desarrollo ${codigo}`);
  await p.fill("#v3-code", codigo);
  await p.click('button[type="submit"]');
  await p.waitForTimeout(4500);
} else {
  console.log("2FA:", (await p.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\s+/g, " "));
}

console.log("URL tras entrar:", p.url());

if (!p.url().includes("/portal")) {
  console.log("NO SE ENTRÓ. Texto:", (await p.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\s+/g, " "));
  await p.screenshot({ path: `${SALIDA}/portal-login-fallo.png` });
  await nav.close();
  process.exit(1);
}

const vistas = await p.evaluate(() =>
  [...document.querySelectorAll(".pv3-nav")].map((b) => b.textContent.trim()).filter((t) => !t.includes("Cerrar sesión"))
);
console.log(`\n${vistas.length} vistas en el menú\n`);

for (const v of vistas) {
  errores.length = 0;
  await p.evaluate((etiqueta) => {
    const b = [...document.querySelectorAll(".pv3-nav")].find((x) => x.textContent.trim() === etiqueta);
    if (b) b.click();
  }, v);
  await p.waitForTimeout(3200);

  const m = await p.evaluate(() => ({
    titulo: document.querySelector(".pv3-h1")?.textContent || "",
    vacio: document.querySelector(".pv3-empty")?.textContent?.slice(0, 70) || null,
    esqueletos: document.querySelectorAll(".pv3-skel").length,
    tarjetas: document.querySelectorAll(".pv3-card").length,
    filas: document.querySelectorAll(".pv3-table tbody tr").length,
    desbordaX: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));

  const mal = [];
  if (m.esqueletos > 0) mal.push(`${m.esqueletos} esqueletos aún cargando`);
  if (m.desbordaX) mal.push("scroll horizontal");
  if (errores.length) mal.push(errores[0]);
  if (m.tarjetas === 0 && m.filas === 0 && !m.vacio) mal.push("vista vacía sin mensaje");

  const arch = v.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await p.screenshot({ path: `${SALIDA}/portal-${arch}.png` });

  console.log(
    `${mal.length ? "✗" : "✓"} ${v.padEnd(24)} ${String(m.tarjetas).padStart(2)} tarjetas ${String(m.filas).padStart(3)} filas` +
    (m.vacio ? `  «${m.vacio}»` : "") +
    (mal.length ? `\n    → ${mal.join("\n    → ")}` : "")
  );
}

await nav.close();
