import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const RAIZ_MIGRACIONES = path.resolve("supabase/migrations");

async function migracionesActivas() {
  const nombres = (await readdir(RAIZ_MIGRACIONES, { withFileTypes: true }))
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith(".sql"))
    .map((entrada) => entrada.name);
  return Promise.all(nombres.map(async (nombre) => ({
    nombre,
    sql: await readFile(path.join(RAIZ_MIGRACIONES, nombre), "utf8"),
  })));
}

function sinComentarios(sql) {
  return sql.replace(/--.*$/gm, "");
}

test("las migraciones no conceden acceso directo a anon ni authenticated", async () => {
  for (const { nombre, sql } of await migracionesActivas()) {
    const concesionesPublicas = sinComentarios(sql).match(/\bgrant\b(?:(?!;)[\s\S]){0,500}\bto\s+(?:anon|authenticated)\b/gi) || [];
    assert.deepEqual(concesionesPublicas, [], `${nombre} concede privilegios públicos`);
  }
});

test("la migración de blindaje conserva revocaciones, RLS forzado y defaults cerrados", async () => {
  const sql = await readFile(path.join(RAIZ_MIGRACIONES, "20260909_blindar_acceso_publico.sql"), "utf8");

  assert.match(sql, /revoke all on all tables[\s\S]*from anon, authenticated/i);
  assert.match(sql, /alter default privileges[\s\S]*revoke all on tables[\s\S]*from anon, authenticated/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /create policy[\s\S]*as restrictive[\s\S]*using \(false\)[\s\S]*with check \(false\)/i);
  assert.match(sql, /revoke execute on all functions[\s\S]*from public/i);
  assert.match(sql, /alter default privileges[\s\S]*revoke execute on functions from public/i);
});

test("cada security definer fija search_path y sólo se concede a service_role", async () => {
  for (const { nombre, sql } of await migracionesActivas()) {
    const inicios = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)];
    for (let indice = 0; indice < inicios.length; indice += 1) {
      const funcion = inicios[indice][1];
      const inicio = inicios[indice].index;
      const fin = inicios[indice + 1]?.index ?? sql.length;
      const bloque = sql.slice(inicio, fin);
      if (!/security\s+definer/i.test(bloque)) continue;

      assert.match(bloque, /set\s+search_path\s*(?:=|to)/i, `${nombre}: ${funcion} no fija search_path`);
      assert.match(
        sql,
        new RegExp(`revoke\\s+(?:all|execute)\\s+on\\s+function\\s+public\\.${funcion}\\s*\\([\\s\\S]{0,300}?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"),
        `${nombre}: ${funcion} no revoca PUBLIC/anon/authenticated`,
      );
      assert.match(
        sql,
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${funcion}\\s*\\([\\s\\S]{0,300}?to\\s+service_role`, "i"),
        `${nombre}: ${funcion} no limita la ejecución a service_role`,
      );
    }
  }
});
