#!/usr/bin/env node
/**
 * Recorre la cadena de auditoría y dice si alguien la ha tocado.
 *
 *   node --import ./tests/alias.mjs scripts/verificar-auditoria.mjs [--muestra=500]
 *
 * Hace lo mismo que el mantenimiento diario, pero a mano y con salida
 * legible: la comprobación completa en Postgres y el recálculo en Node de
 * las últimas filas. Sale con código 1 si la cadena está rota.
 */
import fs from "node:fs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const { abrirSobresDeEntorno } = await import("@/lib/server/kms");
await abrirSobresDeEntorno();
const muestra = Number((process.argv.find((a) => a.startsWith("--muestra=")) || "").split("=")[1] || 500);
const { verificarCadenaAuditoria } = await import("@/lib/server/auditoria-cadena");
const resultado = await verificarCadenaAuditoria({ muestra });
console.log(`Postgres (cadena entera): ${resultado.postgres}`);
console.log(`Node (últimas ${resultado.filas} filas): ${resultado.node}`);
console.log(`Checkpoint firmado: ${resultado.checkpoint}`);
console.log(
  resultado.operativa
    ? "La auditoría está intacta y su comprobación terminó correctamente."
    : resultado.intacta
      ? "La auditoría está intacta, pero no se pudo firmar su checkpoint."
      : "LA AUDITORÍA ESTÁ ROTA.",
);
process.exit(resultado.operativa ? 0 : 1);
