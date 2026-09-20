import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const lock = JSON.parse(fs.readFileSync(path.join(RAIZ, "package-lock.json"), "utf8"));
const ci = fs.readFileSync(path.join(RAIZ, ".github/workflows/verificar.yml"), "utf8");

/* Los únicos paquetes a los que se les deja ejecutar código al instalarse.
   Si aparece uno nuevo en el lockfile, este test falla a propósito: alguien
   tiene que mirar qué hace su script antes de añadirlo aquí y al workflow. */
const SCRIPTS_PERMITIDOS = new Set([
  "@sentry/cli", // descarga su binario para subir source maps
  "fsevents", // opcional, sólo macOS; en CI ni se instala
  "unrs-resolver", // binario napi con fallback en JS
]);

test("el lockfile es v3 y todo viene del registro oficial de npm", () => {
  assert.equal(lock.lockfileVersion, 3);
  const ajenos = Object.entries(lock.packages)
    .filter(([nombre, pkg]) => nombre && pkg.resolved && !pkg.resolved.startsWith("https://registry.npmjs.org/"))
    .map(([nombre]) => nombre);
  assert.deepEqual(ajenos, [], "paquetes resueltos fuera de registry.npmjs.org");
});

test("ningún paquete ejecuta scripts de instalación sin estar en la lista", () => {
  const conScripts = Object.entries(lock.packages)
    .filter(([, pkg]) => pkg.hasInstallScript)
    .map(([nombre]) => nombre.replace(/^.*node_modules\//, ""));
  const nuevos = [...new Set(conScripts)].filter((nombre) => !SCRIPTS_PERMITIDOS.has(nombre));
  assert.deepEqual(nuevos, [], "paquetes con install script que nadie ha revisado");
});

test("CI instala sin scripts y sólo reconstruye los permitidos", () => {
  assert.match(ci, /npm ci --ignore-scripts/);
  const rebuild = /npm rebuild ([^\n]+)/.exec(ci)?.[1]?.trim().split(/\s+/) || [];
  assert.ok(rebuild.length > 0, "falta el paso npm rebuild");
  for (const nombre of rebuild) {
    assert.ok(SCRIPTS_PERMITIDOS.has(nombre), `${nombre} se reconstruye en CI sin estar en la lista`);
  }
});

test("Dependabot vigila npm y las actions cada semana", () => {
  const config = fs.readFileSync(path.join(RAIZ, ".github/dependabot.yml"), "utf8");
  assert.match(config, /package-ecosystem: npm/);
  assert.match(config, /package-ecosystem: github-actions/);
  assert.equal((config.match(/interval: weekly/g) || []).length, 2);
});

test("las actions del workflow van fijadas por SHA, no por etiqueta", () => {
  const usos = [...ci.matchAll(/uses: ([^\s#]+)/g)].map((m) => m[1]);
  assert.ok(usos.length > 0);
  for (const uso of usos) {
    assert.match(uso, /@[0-9a-f]{40}$/, `${uso} no está fijada por SHA`);
  }
});
