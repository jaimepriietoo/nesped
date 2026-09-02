// Servidor estático mínimo, solo para ver la página de prueba.
// Se sirve fuera de Next a propósito: la CSP de proxy.js bloquea
// OnlineWebFonts y cdnjs, y sin ellos no cargarían ni la tipografía
// dot-matrix ni Font Awesome.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const raiz = import.meta.dirname;
const tipos = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  // normalize + comprobación de prefijo: evita salirse de la carpeta con ../
  const ruta = join(raiz, normalize(rel));
  if (!ruta.startsWith(raiz)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const buf = await readFile(ruta);
    res.writeHead(200, { "Content-Type": tipos[extname(ruta)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(4100, () => console.log("prueba en http://localhost:4100"));
