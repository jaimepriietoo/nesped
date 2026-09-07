/**
 * Genera la demo del portal a partir del portal real.
 *
 * No se copia a mano a propósito: si el portal cambia, esta demo se queda
 * desfasada en silencio y enseña algo que ya no existe. Se regenera con:
 *
 *     node prueba/build-portal.mjs
 *
 * Lo único que se sustituye es de dónde salen los datos: en vez de llamar a
 * la API con sesión, lee el objeto de muestra de portal-datos.js.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..");
const origen = join(raiz, "app/portal/page.js");
const destino = join(import.meta.dirname, "portal.js");

let src = await readFile(origen, "utf8");

const sustituciones = [
  // El navegador no tiene módulos aquí: React entra por UMD.
  ['"use client";\n\n', ""],
  [
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport "./portal.css";',
    "const { useCallback, useEffect, useMemo, useRef, useState } = React;",
  ],
  // La demo no tiene sesión: los datos salen del fichero de muestra.
  [
    `/** Cualquier 401 significa sesión caducada: volvemos al login conservando el destino. */
async function pedir(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.replace("/login?next=/portal");
    return null;
  }
  const json = await res.json().catch(() => null);
  if (!json?.success) throw new Error(json?.message || "No se pudo cargar la información.");
  return json;
}`,
    `/**
 * En la demo no hay red ni sesión. Se mantiene la firma asíncrona y un
 * retardo corto a propósito, para que se vean los estados de carga reales.
 */
async function pedir(url) {
  await new Promise((listo) => setTimeout(listo, 260));
  if (url === "/api/portal/overview") return window.DEMO.overview;
  const data = window.DEMO[url];
  if (data === undefined) throw new Error("Esta sección no tiene datos en la demo.");
  return { success: true, data };
}`,
  ],
  ["export default function PortalV3()", "function PortalV3()"],
];

for (const [de, a] of sustituciones) {
  if (!src.includes(de)) {
    console.error(`\n✗ No se encontró en page.js:\n${de.slice(0, 90)}…\n`);
    process.exit(1);
  }
  src = src.replace(de, a);
}

const cabecera = `/* GENERADO — no editar a mano.
   Sale de app/portal/page.js vía prueba/build-portal.mjs. */

`;

const pie = `
ReactDOM.createRoot(document.getElementById("raiz")).render(<PortalV3 />);
`;

await writeFile(destino, cabecera + src + pie, "utf8");
console.log("✓ portal.js generado desde app/portal/page.js");
