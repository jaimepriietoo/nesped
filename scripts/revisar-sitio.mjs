/**
 * Comprobación de humo de las páginas públicas con un navegador real.
 *
 *   node scripts/revisar-sitio.mjs                  # contra localhost:3000
 *   BASE=https://nesped.com node scripts/revisar-sitio.mjs
 *
 * Busca lo que una compilación correcta no detecta: páginas que no hacen
 * scroll, bloques que se quedan invisibles porque falló el JavaScript,
 * barras horizontales, errores de consola y páginas sin contenido.
 *
 * Sale con código 1 si algo falla, para poder encadenarlo en un despliegue.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const CAPTURAS = process.env.CAPTURAS || "";

const PAGINAS = [
  { ruta: "/", nombre: "home", minAlto: 3000, minTexto: 1500 },
  { ruta: "/pricing", nombre: "pricing", minAlto: 1800, minTexto: 900 },
  { ruta: "/login", nombre: "login", minTexto: 90 },
  { ruta: "/legal/voice-compliance", nombre: "legal", minAlto: 1000, minTexto: 900 },
  { ruta: "/c/demo", nombre: "cliente", minTexto: 200 },
  { ruta: "/legal/aviso-legal", nombre: "aviso-legal", minTexto: 900 },
  { ruta: "/legal/privacidad", nombre: "privacidad", minTexto: 2000 },
  { ruta: "/legal/terminos", nombre: "terminos", minTexto: 2000 },
  { ruta: "/legal/cookies", nombre: "cookies", minTexto: 900 },
  { ruta: "/robots.txt", nombre: "robots", crudo: true },
  { ruta: "/sitemap.xml", nombre: "sitemap", crudo: true },
  { ruta: "/no-existe", nombre: "404", espera404: true, minTexto: 40 },
];

const PROTEGIDAS = ["/portal", "/admin", "/admin/clients"];

const nav = await chromium.launch({ channel: "chrome" });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });

let fallos = 0;
const marcar = (msgs) => { fallos += msgs.length; return msgs; };

console.log(`Revisando ${BASE}\n`);

for (const p of PAGINAS) {
  const pag = await ctx.newPage();
  const errores = [];
  pag.on("pageerror", (e) => errores.push(`JS: ${e.message.slice(0, 90)}`));
  pag.on("console", (m) => {
    // Un 404 en la propia página de 404 es lo esperado, no un fallo.
    if (m.type() === "error" && !(p.espera404 && m.text().includes("404"))) {
      errores.push(`consola: ${m.text().slice(0, 90)}`);
    }
  });

  const res = await pag.goto(BASE + p.ruta, { waitUntil: "domcontentloaded", timeout: 40000 });
  // Margen para que hidrate y para que salten las redes de seguridad del
  // revelado (3 s) y de los contadores (5,2 s).
  if (!p.crudo) await pag.waitForTimeout(7000);

  const m = p.crudo
    ? { texto: (await pag.content()).length, alto: 0, desborda: false, ocultos: 0 }
    : await pag.evaluate(() => ({
        alto: document.documentElement.scrollHeight,
        desborda: document.documentElement.scrollWidth > window.innerWidth + 1,
        ocultos: document.querySelectorAll(".v3-rev:not(.is-in)").length,
        texto: document.body.innerText.trim().length,
        sinAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
        h1: document.querySelectorAll("h1").length,
      }));

  const mal = [];
  const esperado = p.espera404 ? 404 : 200;
  if (res.status() !== esperado) mal.push(`HTTP ${res.status()} (se esperaba ${esperado})`);
  if (p.minAlto && m.alto < p.minAlto) mal.push(`sólo ${m.alto}px de alto: ¿falta contenido?`);
  if (p.minTexto && m.texto < p.minTexto) mal.push(`sólo ${m.texto} caracteres`);
  if (m.desborda) mal.push("barra de scroll horizontal");
  if (m.ocultos) mal.push(`${m.ocultos} bloques invisibles`);
  if (m.sinAlt) mal.push(`${m.sinAlt} imágenes sin alt`);
  if (!p.crudo && m.h1 === 0) mal.push("sin <h1>");
  if (!p.crudo && m.h1 > 1) mal.push(`${m.h1} elementos <h1>`);
  mal.push(...errores);

  if (CAPTURAS && !p.crudo) await pag.screenshot({ path: `${CAPTURAS}/${p.nombre}.png`, fullPage: true });

  marcar(mal);
  console.log(`${mal.length ? "✗" : "✓"} ${p.ruta.padEnd(26)}` + (mal.length ? `\n    → ${mal.join("\n    → ")}` : ""));
  await pag.close();
}

// Nadie debe poder ver el portal ni la administración sin sesión.
console.log("");
for (const ruta of PROTEGIDAS) {
  const r = await ctx.request.get(BASE + ruta, { maxRedirects: 0 });
  const bien = r.status() === 307 || r.status() === 302;
  if (!bien) fallos += 1;
  console.log(`${bien ? "✓" : "✗"} ${ruta.padEnd(26)} sin sesión → ${r.status()}`);
}

// La lista de clientes no puede ser pública.
const fuga = await ctx.request.get(`${BASE}/api/clients`);
const cerrada = fuga.status() === 403 || fuga.status() === 401;
if (!cerrada) fallos += 1;
console.log(`${cerrada ? "✓" : "✗"} /api/clients${" ".repeat(14)} sin sesión → ${fuga.status()}`);

await nav.close();
console.log(fallos === 0 ? "\n✓ Sin incidencias." : `\n✗ ${fallos} incidencia(s).`);
process.exit(fallos === 0 ? 0 : 1);
