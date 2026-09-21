#!/usr/bin/env node
/**
 * Fase 5: rotar la clave maestra de datos.
 *
 *   NESPED_DATA_ENCRYPTION_KEY_ANTERIOR=<vieja> node --import ./tests/alias.mjs scripts/recifrar-datos.mjs
 *
 * Con la clave anterior descifra cada sobre y con la nueva (la de
 * .env.local) lo vuelve a cerrar, por lotes. Se puede cortar y relanzar:
 * lo que ya está con la nueva clave se detecta porque abre con ella.
 */
import fs from "node:fs";
for (const l of (() => { try { return fs.readFileSync(".env.local", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const anterior = process.env.NESPED_DATA_ENCRYPTION_KEY_ANTERIOR;
if (!anterior) { console.error("Falta NESPED_DATA_ENCRYPTION_KEY_ANTERIOR"); process.exit(2); }
const { TABLAS, cifrar, descifrar } = await import("@/lib/server/cifrado-datos");
const { getSupabaseAdministrativo } = await import("@/lib/supabase");
const supabase = getSupabaseAdministrativo({ crudo: true });
const envVieja = { ...process.env, NESPED_DATA_ENCRYPTION_KEY: anterior };
let recifradas = 0;
for (const [tabla, def] of Object.entries(TABLAS)) {
  for (const columna of def.cifradas) {
    let desde = null;
    for (;;) {
      let q = supabase.from(tabla).select(`id,client_id,${columna}_cifrado`).not(`${columna}_cifrado`, "is", null).order("id").limit(200);
      if (desde) q = q.gt("id", desde);
      const { data, error } = await q;
      if (error) { console.error(error.message); process.exit(1); }
      if (!data?.length) break;
      for (const fila of data) {
        const sobre = fila[`${columna}_cifrado`];
        let claro;
        try { descifrar({ tabla, columna, clientId: fila.client_id, sobre }); continue; } catch { /* con la nueva no abre: toca */ }
        try { claro = descifrar({ tabla, columna, clientId: fila.client_id, sobre, env: envVieja }); } catch { console.error(`No abre ni con la vieja: ${tabla} ${fila.id}`); process.exit(1); }
        const { error: e } = await supabase.from(tabla).update({ [`${columna}_cifrado`]: cifrar({ tabla, columna, clientId: fila.client_id, valor: claro }) }).eq("id", fila.id);
        if (e) { console.error(e.message); process.exit(1); }
        recifradas += 1;
      }
      desde = data[data.length - 1].id;
    }
  }
}
console.log(`Recifradas ${recifradas} celdas con la clave nueva. Ya puedes retirar la anterior.`);
