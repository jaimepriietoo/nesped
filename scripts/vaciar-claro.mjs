#!/usr/bin/env node
/**
 * Fase 4 del cifrado: pone a null las columnas en claro que ya tienen sobre.
 *
 *   node --import ./tests/alias.mjs scripts/vaciar-claro.mjs [--de-verdad]
 *
 * Sin --de-verdad sólo cuenta. Exige NESPED_CIFRADO_DATOS=solo en .env.local:
 * si la app aún leyera el claro, vaciarlo sería perder los datos a la vista.
 * No borra nada que no tenga sobre.
 */
import fs from "node:fs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const deVerdad = process.argv.includes("--de-verdad");
const { TABLAS, modoCifrado } = await import("@/lib/server/cifrado-datos");
const { getSupabaseAdministrativo } = await import("@/lib/supabase");
if (modoCifrado() !== "solo") { console.error("NESPED_CIFRADO_DATOS tiene que ser `solo` para vaciar el claro."); process.exit(2); }
const supabase = getSupabaseAdministrativo({ crudo: true });
let total = 0;
for (const [tabla, def] of Object.entries(TABLAS)) {
  for (const columna of def.cifradas) {
    const { count } = await supabase.from(tabla).select("id", { count: "exact", head: true })
      .not(`${columna}_cifrado`, "is", null).not(columna, "is", null);
    console.log(`${tabla}.${columna}: ${count || 0} filas con claro y sobre`);
    total += Number(count || 0);
    if (!deVerdad || !count) continue;
    for (;;) {
      const { data } = await supabase.from(tabla).select("id").not(`${columna}_cifrado`, "is", null).not(columna, "is", null).limit(500);
      if (!data?.length) break;
      const { error } = await supabase.from(tabla).update({ [columna]: null }).in("id", data.map((f) => f.id));
      if (error) { console.error(`Error en ${tabla}.${columna}: ${error.message}`); process.exit(1); }
    }
  }
}
console.log(deVerdad ? `Vaciadas ${total} celdas en claro.` : `Se vaciarían ${total} celdas. Repite con --de-verdad.`);
