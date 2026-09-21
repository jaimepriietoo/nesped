#!/usr/bin/env node
/**
 * Cierra un secreto en un sobre KMS para pegarlo en Vercel.
 *
 *   node --import ./tests/alias.mjs scripts/cerrar-sobre.mjs NOMBRE_DE_LA_VARIABLE
 *
 * Pide el valor por teclado (no por argumento, para que no quede en el
 * historial de la shell) y escribe el sobre `kms:v1:…`. Ese sobre va en
 * Vercel en la variable del mismo nombre; la app lo abre al arrancar.
 * Usa las credenciales AWS de .env.local.
 */
import fs from "node:fs";
import readline from "node:readline/promises";
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
const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
const valor = (await rl.question(`Valor actual de ${nombre} (no se muestra en pantalla al pegar en Vercel): `)).trim();
rl.close();
if (!valor) { console.error("Vacío."); process.exit(2); }
const sobre = await cerrarSobre(valor, { nombre });
const comprobado = await abrirSobre(sobre, { nombre });
if (comprobado !== valor) { console.error("El sobre no se abre con el mismo valor; no lo uses."); process.exit(1); }
console.error(`\nSobre cerrado y comprobado. Pega esto en Vercel como ${nombre}:\n`);
console.log(sobre);
