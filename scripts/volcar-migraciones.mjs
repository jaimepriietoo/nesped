/**
 * Vuelca al repositorio el SQL de las migraciones aplicadas en Supabase.
 *
 * POR QUÉ EXISTE. Los ficheros de supabase/migrations/ que se escribieron a
 * mano son prosa: explican qué se hizo y por qué, pero no llevan el DDL. Sin
 * esto, el repositorio NO puede reconstruir la base de datos, y la forma del
 * esquema existe en un solo sitio: dentro del proveedor. Es una dependencia
 * que no se ve hasta el día que se necesita.
 *
 * POR QUÉ FILTRA. Este repositorio es PÚBLICO. Entre las migraciones aplicadas
 * hay algunas que no cambian el esquema sino que insertan datos: el alta del
 * primer cliente real lleva su nombre, su correo y su contraseña hasheada.
 * Eso no reconstruye nada y no puede publicarse.
 *
 * Así que se excluye lo que contenga datos de personas, y se deja constancia
 * de lo excluido en el LEEME. Una exclusión silenciosa sería peor que no
 * filtrar: alguien reconstruiría el esquema creyendo que lo tiene entero.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DESTINO = path.join(RAIZ, "supabase/migrations/historico");

const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
const leer = (clave) =>
  (env.match(new RegExp(`^${clave}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");

/**
 * El número de voz de Nesped ya está en lib/clients.js, que se publica. No es
 * exposición nueva y no debe disparar el filtro.
 */
const YA_PUBLICO = new Set(["+34983460825", "34983460825"]);

/** Qué hace que un fichero no pueda publicarse. */
const SENALES = [
  {
    nombre: "una dirección de correo",
    // Se excluyen los dominios de ejemplo, que existen justo para esto.
    prueba: (sql) =>
      [...sql.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)]
        .map((m) => m[0])
        .filter((c) => !/@(ejemplo|example)\.(invalid|com|org)$/i.test(c)),
  },
  {
    nombre: "un teléfono",
    prueba: (sql) =>
      [...sql.matchAll(/\+?34\d{9}/g)].map((m) => m[0]).filter((t) => !YA_PUBLICO.has(t)),
  },
  {
    nombre: "algo que parece una clave o un hash",
    // Cadenas largas sin espacios dentro de comillas simples: hashes de scrypt,
    // tokens, claves. Un identificador normal no llega a 40 caracteres.
    prueba: (sql) =>
      [...sql.matchAll(/'([A-Za-z0-9+/=$:._-]{40,})'/g)]
        .map((m) => m[1])
        .filter((v) => !/^[a-z_]+$/i.test(v)),
  },
];

function loQueNoSePuedePublicar(sql) {
  const motivos = [];
  for (const senal of SENALES) {
    const encontrado = senal.prueba(sql);
    if (encontrado.length > 0) motivos.push(`${senal.nombre} (${encontrado.length})`);
  }
  return motivos;
}

const supabase = createClient(
  leer("NEXT_PUBLIC_SUPABASE_URL"),
  leer("SUPABASE_SERVICE_ROLE_KEY")
);

const { data, error } = await supabase.rpc("exportar_migraciones");
if (error) {
  console.error("No se pudieron leer las migraciones:", error.message);
  process.exit(1);
}

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });

const escritas = [];
const excluidas = [];

for (const m of data) {
  const nombre = `${m.version}_${m.name || "sin_nombre"}.sql`;
  const motivos = loQueNoSePuedePublicar(m.sql);

  if (motivos.length > 0) {
    excluidas.push({ nombre, motivos });
    continue;
  }

  fs.writeFileSync(path.join(DESTINO, nombre), `${m.sql}\n`, "utf8");
  escritas.push(nombre);
}

const leeme = `# Histórico de migraciones

Volcado de las migraciones aplicadas en Supabase, generado por
\`npm run volcar:migraciones\`. Es lo que permite reconstruir el esquema sin
depender de que la consola del proveedor siga estando ahí.

Los ficheros \`../2026*_fase*.sql\` son otra cosa: explican **por qué** se hizo
cada cambio. Estos de aquí son el **qué**, tal cual se aplicó.

Última actualización: ${new Date().toISOString().slice(0, 10)}
Migraciones publicadas: ${escritas.length} de ${data.length}

## Lo que NO está aquí, y por qué

Este repositorio es público. Se excluyen las migraciones que insertan datos de
personas —nombres, correos, contraseñas hasheadas de clientes reales—, porque
no reconstruyen ningún esquema y no pueden publicarse.

Se listan para que nadie reconstruya la base de datos creyendo que la tiene
entera:

${
  excluidas.length === 0
    ? "Ninguna."
    : excluidas.map((e) => `- \`${e.nombre}\` — contiene ${e.motivos.join(", ")}`).join("\n")
}

Si hace falta rehacer un entorno con esos datos, salen de una copia de
seguridad de Supabase, no de aquí.
`;

fs.writeFileSync(path.join(DESTINO, "LEEME.md"), leeme, "utf8");

console.log(`Publicadas: ${escritas.length}`);
console.log(`Excluidas:  ${excluidas.length}`);
for (const e of excluidas) console.log(`  ${e.nombre} → ${e.motivos.join(", ")}`);
