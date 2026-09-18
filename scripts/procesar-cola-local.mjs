#!/usr/bin/env node
/**
 * Procesa la cola desde esta máquina, con el mismo código que la ruta
 * /api/cola/procesar y el .env.local de aquí.
 *
 *   node --import ./tests/alias.mjs scripts/procesar-cola-local.mjs [--pasadas=5]
 *
 * Para cuando el latido de Railway no llega (cortafuegos, caída) y hay
 * trabajos pendientes que no pueden esperar al cron diario. No es un
 * sustituto del latido: es la manivela.
 */
import fs from "node:fs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const pasadas = Number((process.argv.find((a) => a.startsWith("--pasadas=")) || "").split("=")[1] || 3);
const token = process.env.INTERNAL_API_TOKEN || process.env.CRON_SECRET;
if (!token) { console.error("Falta INTERNAL_API_TOKEN"); process.exit(1); }
const { POST } = await import("@/app/api/cola/procesar/route");
for (let i = 0; i < pasadas; i += 1) {
  const res = await POST(new Request("http://localhost/api/cola/procesar", { method: "POST", headers: { "x-nesped-internal-token": token } }));
  const json = await res.json().catch(() => ({}));
  console.log(`pasada ${i + 1}:`, res.status, JSON.stringify(json).slice(0, 400));
  if (!json?.quedaTrabajo && !json?.procesados) break;
}
