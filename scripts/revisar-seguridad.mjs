/**
 * Comprobación de seguridad, repetible.
 *
 *   node scripts/revisar-seguridad.mjs
 *   BASE=https://nesped.com node scripts/revisar-seguridad.mjs
 *
 * Cada comprobación corresponde a un fallo que existió de verdad en este
 * proyecto. Están aquí para que no puedan volver sin que nadie se entere.
 *
 * Las que necesitan la clave pública de Supabase se saltan si no hay
 * .env.local, para poder ejecutarlo también contra producción.
 */
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";

let fallos = 0;
const resultados = [];

function comprobar(titulo, ok, detalle = "") {
  if (!ok) fallos += 1;
  resultados.push(`${ok ? "✓" : "✗"} ${titulo}${detalle ? `\n    → ${detalle}` : ""}`);
}

/* ── Cabeceras ─────────────────────────────────────────────────────── */

const portada = await fetch(BASE + "/", { redirect: "manual" });
const h = (n) => portada.headers.get(n) || "";

comprobar("X-Content-Type-Options: nosniff", h("x-content-type-options") === "nosniff");
comprobar("X-Frame-Options: DENY", h("x-frame-options") === "DENY");
comprobar("Referrer-Policy restrictiva", h("referrer-policy").includes("strict-origin"));
comprobar("Permissions-Policy cierra cámara y micrófono",
  h("permissions-policy").includes("camera=()") && h("permissions-policy").includes("microphone=()"));
comprobar("Cross-Origin-Opener-Policy: same-origin", h("cross-origin-opener-policy") === "same-origin");
comprobar("Cross-Origin-Resource-Policy presente", Boolean(h("cross-origin-resource-policy")));
comprobar("Sin cabecera X-Powered-By", !portada.headers.get("x-powered-by"),
  portada.headers.get("x-powered-by") || "");

const csp = h("content-security-policy");
comprobar("Hay política de contenido", Boolean(csp));
comprobar("frame-ancestors 'none' (anti clickjacking)", csp.includes("frame-ancestors 'none'"));
comprobar("object-src 'none' (sin plugins)", csp.includes("object-src 'none'"));
comprobar("base-uri acotado", csp.includes("base-uri 'self'"));
comprobar("connect-src no permite cualquier host",
  !/connect-src[^;]*\shttps:(\s|;|$)/.test(csp), csp.match(/connect-src[^;]*/)?.[0] || "");

if (BASE.startsWith("https://")) {
  comprobar("HSTS activo", h("strict-transport-security").includes("max-age=63072000"));
}

/* ── Nonce en las zonas con sesión ─────────────────────────────────── */

const zonaPrivada = await fetch(BASE + "/portal", { redirect: "manual" });
const cspPrivada = zonaPrivada.headers.get("content-security-policy") || "";
comprobar("/portal usa nonce en los scripts", /script-src[^;]*'nonce-/.test(cspPrivada));
comprobar("/portal no permite scripts en línea",
  !/script-src[^;]*'unsafe-inline'/.test(cspPrivada), cspPrivada.match(/script-src[^;]*/)?.[0] || "");

/* ── Acceso ────────────────────────────────────────────────────────── */

for (const ruta of ["/portal", "/admin", "/admin/clients"]) {
  const r = await fetch(BASE + ruta, { redirect: "manual" });
  comprobar(`${ruta} exige sesión`, r.status >= 300 && r.status < 400, `devolvió ${r.status}`);
}

/*
 * La excepción, y es a propósito: /portal/setup-account es la única página
 * bajo /portal a la que se llega sin cuenta, porque es donde Stripe devuelve
 * a quien acaba de pagar para que elija sus credenciales. Si algún día vuelve
 * a exigir sesión, quien pague no podrá darse de alta, así que se comprueba
 * que siga abierta.
 */
const alta = await fetch(BASE + "/portal/setup-account", { redirect: "manual" });
comprobar(
  "/portal/setup-account accesible tras pagar",
  alta.status === 200,
  `devolvió ${alta.status}: quien pague no podría crear su cuenta`
);

for (const [ruta, esperado] of [
  ["/api/clients", [401, 403]],
  ["/api/portal/overview", [401, 403]],
  ["/api/admin/clients", [401, 403]],
  ["/api/admin/users", [401, 403]],
  ["/api/portal/users/create", [401, 403, 405]],
]) {
  const r = await fetch(BASE + ruta);
  comprobar(`${ruta} cerrado sin sesión`, esperado.includes(r.status), `devolvió ${r.status}`);
}

/* ── Redirección abierta ───────────────────────────────────────────── */

for (const carga of ["//evil.com", "/\\evil.com", "https://evil.com", "/\\\\evil.com"]) {
  const r = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "no-existe@nesped.invalid", password: "x", next: carga }),
  });
  const json = await r.json().catch(() => ({}));
  const destino = json.redirectTo || "";
  // Con credenciales falsas no debería haber redirectTo; si lo hubiera,
  // nunca puede apuntar fuera del sitio.
  comprobar(
    `next=${JSON.stringify(carga)} no escapa del dominio`,
    !destino || (destino.startsWith("/") && !destino.startsWith("//")),
    destino
  );
}

/* ── Páginas legales ───────────────────────────────────────────────── */

/*
 * Vender en España sin aviso legal ni política de privacidad publicados es
 * una infracción, no un detalle pendiente. Se comprueba que sigan ahí.
 */
for (const ruta of ["/legal/aviso-legal", "/legal/privacidad", "/legal/terminos", "/legal/cookies"]) {
  const r = await fetch(BASE + ruta);
  comprobar(`${ruta} publicada`, r.status === 200, `devolvió ${r.status}`);
}

/* ── security.txt ──────────────────────────────────────────────────── */

const sec = await fetch(BASE + "/.well-known/security.txt");
comprobar("Hay .well-known/security.txt", sec.status === 200, `devolvió ${sec.status}`);

/* ── Base de datos expuesta ────────────────────────────────────────── */

if (fs.existsSync(".env.local")) {
  const env = Object.fromEntries(
    fs.readFileSync(".env.local", "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anon) {
    // La clave anónima viaja en el navegador de cualquier visitante: lo que
    // ella pueda leer, lo puede leer todo el mundo.
    for (const objeto of [
      "clients", "leads", "calls", "users", "portal_users",
      "audit_logs", "weekly_reports", "client_dashboard_summary",
    ]) {
      const r = await fetch(`${url}/rest/v1/${objeto}?select=*&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      const cuerpo = await r.json().catch(() => null);
      const filas = Array.isArray(cuerpo) ? cuerpo.length : 0;
      comprobar(`${objeto} no es legible con la clave pública`, filas === 0,
        filas > 0 ? `¡devolvió ${filas} fila(s)!` : "");
    }
  }
}

console.log(`Seguridad — ${BASE}\n`);
console.log(resultados.join("\n"));
console.log(fallos === 0 ? "\n✓ Sin incidencias." : `\n✗ ${fallos} incidencia(s).`);
process.exit(fallos === 0 ? 0 : 1);
