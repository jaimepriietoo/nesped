#!/usr/bin/env node
/**
 * Comprueba una restauración: ¿el proyecto de prueba tiene lo mismo que
 * producción en la fecha del volcado?
 *
 *   node scripts/simulacro-restauracion.mjs --restaurado=.env.simulacro [--hasta=2026-09-20]
 *
 * `.env.simulacro` lleva SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del proyecto
 * donde se ha restaurado el volcado (paso 2 de docs/copias-y-recuperacion.md).
 * Producción se lee de .env.local. No escribe nada en ninguno de los dos.
 *
 * Para cada tabla clave compara cuántas filas hay hasta la fecha del volcado
 * (por created_at) y, en la auditoría, además que la cadena de hashes del
 * proyecto restaurado esté íntegra. Imprime una tabla y sale con 1 si algo
 * no cuadra, para que el resultado se pueda pegar tal cual en el documento.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function leerEnv(ruta) {
  const env = {};
  for (const l of (() => { try { return fs.readFileSync(ruta, "utf8").split("\n"); } catch { return []; } })()) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const arg = (nombre, porDefecto) => (process.argv.find((a) => a.startsWith(`--${nombre}=`)) || "").split("=")[1] || porDefecto;
const rutaRestaurado = arg("restaurado", ".env.simulacro");
const hasta = arg("hasta", new Date().toISOString().slice(0, 10));

const prod = leerEnv(".env.local");
const rest = leerEnv(rutaRestaurado);
for (const [nombre, env] of [[".env.local", prod], [rutaRestaurado, rest]]) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`${nombre}: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY`);
    process.exit(2);
  }
}
if (prod.SUPABASE_URL === rest.SUPABASE_URL) {
  console.error("El proyecto restaurado es el mismo que producción: eso no es un simulacro.");
  process.exit(2);
}

const cliente = (env) => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const P = cliente(prod);
const R = cliente(rest);

/* Las tablas que, si faltan, se nota. created_at acota a la fecha del volcado. */
const TABLAS = ["clients", "users", "portal_users", "leads", "calls", "lead_events", "audit_logs", "appointments", "subscriptions"];
const limite = `${hasta}T23:59:59.999Z`;

async function contar(c, tabla) {
  const { count, error } = await c.from(tabla).select("*", { count: "exact", head: true }).lte("created_at", limite);
  if (error) return { error: error.message };
  return { count: Number(count || 0) };
}

let fallos = 0;
const filas = [];
for (const tabla of TABLAS) {
  const [p, r] = await Promise.all([contar(P, tabla), contar(R, tabla)]);
  const ok = !p.error && !r.error && p.count === r.count;
  if (!ok) fallos += 1;
  filas.push({ tabla, produccion: p.error ? `error: ${p.error}` : p.count, restaurado: r.error ? `error: ${r.error}` : r.count, ok: ok ? "sí" : "NO" });
}

const { data: roturas, error: errorCadena } = await R.rpc("verificar_cadena_auditoria", { p_desde: 0 });
const cadena = errorCadena ? `error: ${errorCadena.message}` : roturas?.length ? `rota en ${roturas[0].secuencia}: ${roturas[0].motivo}` : "íntegra";
if (cadena !== "íntegra") fallos += 1;

console.log(`Simulacro de restauración · volcado hasta ${hasta}\n`);
console.table(filas);
console.log(`\nCadena de auditoría en el restaurado: ${cadena}`);
console.log(fallos ? `\n${fallos} comprobaciones NO cuadran.` : "\nTodo cuadra. Anota fecha, tiempo del pg_restore y quién en docs/copias-y-recuperacion.md.");
process.exit(fallos ? 1 : 0);
