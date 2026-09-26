import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * El latido de la cola en Supabase (pg_cron + pg_net) sustituye al de
 * Railway. Si se programa mal no se rompe nada ruidosamente: los correos,
 * las grabaciones y los webhooks simplemente dejan de salir. Y si se escribe
 * mal, el secreto acaba en cron.job o en la URL, donde lo lee cualquiera con
 * acceso a la base o a los registros.
 *
 * No hay Postgres en las pruebas de unidad, así que se comprueba el SQL tal
 * cual se va a aplicar. Lo que sólo se ve ejecutándolo está en el runbook,
 * fase A.
 */

const MIGRACION = "supabase/migrations/20260926100000_latido_cola_en_supabase.sql";
const REVERSION = "supabase/reversiones/20260926100000_latido_cola_en_supabase.sql";
const TRABAJO = "nesped-procesar-cola";
const SECRETO = "nesped_cola_cron_secret";
const DESTINO = "https://www.nesped.com/api/cola/procesar";

const sinComentarios = (sql) => sql.replace(/--.*$/gm, "");
const leer = async (ruta) => sinComentarios(await readFile(ruta, "utf8"));

function funcionLatir(sql) {
  const inicio = sql.search(/create\s+or\s+replace\s+function\s+private\.latir_cola\s*\(/i);
  assert.ok(inicio >= 0, "falta private.latir_cola()");
  const cuerpo = sql.slice(inicio).match(/as \$\$([\s\S]*?)\$\$;/);
  assert.ok(cuerpo, "no se encuentra el cuerpo de private.latir_cola()");
  return cuerpo[1];
}

test("programa un único trabajo, con nombre estable, cada 30 segundos", async () => {
  const sql = await leer(MIGRACION);
  const programados = [...sql.matchAll(/cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/gi)];

  assert.equal(programados.length, 1, "tiene que haber exactamente un cron.schedule");
  const [, nombre, cuando, orden] = programados[0];
  assert.equal(nombre, TRABAJO);
  assert.equal(cuando, "30 seconds", "el intervalo es el mismo que el de Railway");
  assert.equal(orden, "select private.latir_cola()", "el comando programado no lleva nada más que la llamada");
});

test("apunta sólo a www.nesped.com/api/cola/procesar, por POST y sin parámetros", async () => {
  const sql = await leer(MIGRACION);
  const urls = [...sql.matchAll(/https?:\/\/[^\s'"]+/g)].map((m) => m[0]);

  assert.deepEqual([...new Set(urls)], [DESTINO]);
  assert.doesNotMatch(sql, /net\.http_(get|delete)\s*\(/i);
  assert.equal((sql.match(/net\.http_post\s*\(/gi) || []).length, 1);
  /* Ni query string ni `params`: pg_net los añadiría a la URL, y una URL
     acaba en los registros de acceso de Vercel. */
  assert.doesNotMatch(sql, /params\s*:=/i);
  assert.doesNotMatch(sql, /procesar\?/);
});

test("el secreto sale de Vault en cada latido y viaja en la cabecera Authorization", async () => {
  const cuerpo = funcionLatir(await leer(MIGRACION));

  assert.match(
    cuerpo,
    new RegExp(`from\\s+vault\\.decrypted_secrets[\\s\\S]*?where\\s+s\\.name\\s*=\\s*'${SECRETO}'`, "i"),
  );
  assert.match(cuerpo, /'Authorization'\s*,\s*'Bearer '\s*\|\|\s*v_secreto/);
  assert.doesNotMatch(cuerpo, /url\s*:=[^,]*v_secreto/i, "el secreto no puede ir en la URL");
});

test("ni la migración ni la reversión llevan un secreto escrito", async () => {
  for (const ruta of [MIGRACION, REVERSION]) {
    const crudo = await readFile(ruta, "utf8");

    /* Las mismas señales que usa scripts/volcar-migraciones.mjs para no
       publicar un fichero: cadenas largas sin espacios entre comillas. La
       única permitida es la dirección pública del destino. */
    const largas = [...crudo.matchAll(/'([A-Za-z0-9+/=$:._-]{32,})'/g)]
      .map((m) => m[1])
      .filter((v) => v !== DESTINO);
    assert.deepEqual(largas, [], `${ruta} tiene algo que parece una clave`);
    assert.doesNotMatch(crudo, /vault\.create_secret|vault\.update_secret/i, `${ruta} no puede crear el secreto`);
    assert.doesNotMatch(crudo, /Bearer\s+[A-Za-z0-9]/, `${ruta} lleva un Bearer con valor`);
    assert.doesNotMatch(crudo, /(sk_live|sk_test|eyJ[A-Za-z0-9_-]{10,}|re_[A-Za-z0-9]{16,})/);
  }
});

test("el volcado al histórico la publicará, y sigue parando un secreto de verdad", async () => {
  /* Si una señal la marcase, npm run volcar:migraciones la dejaría fuera de
     supabase/migrations/historico/ y el esquema no se podría reconstruir. */
  const { loQueNoSePuedePublicar } = await import("../../scripts/senales-publicacion.mjs");
  const crudo = await readFile(MIGRACION, "utf8");

  assert.deepEqual(loQueNoSePuedePublicar(crudo), []);
  assert.notDeepEqual(loQueNoSePuedePublicar(`select '${"a1B2".repeat(12)}';`), []);
  assert.notDeepEqual(
    loQueNoSePuedePublicar(`select 'https://www.nesped.com/api/x/${"a1B2".repeat(12)}';`),
    [],
    "la excepción es sólo para rutas legibles, no para un token metido en la dirección",
  );
});

test("la petición tiene techo de tiempo", async () => {
  const cuerpo = funcionLatir(await leer(MIGRACION));
  const techo = Number(cuerpo.match(/timeout_milliseconds\s*:=\s*(\d+)/i)?.[1]);

  assert.ok(techo > 0, "sin timeout_milliseconds pg_net corta a los 2 s y la pasada parece fallida");
  assert.ok(techo <= 60_000, "un techo mayor que dos latidos apila peticiones");
});

test("sin secreto, el trabajo queda inactivo y la función no envía nada", async () => {
  const sql = await leer(MIGRACION);
  const cuerpo = funcionLatir(sql);

  /* Al aplicar: si Vault no tiene el secreto, se programa desactivado. */
  assert.match(sql, new RegExp(`from\\s+vault\\.secrets\\s+where\\s+name\\s*=\\s*'${SECRETO}'`, "i"));
  assert.match(sql, /if\s+not\s+v_hay_secreto\s+then\s+perform\s+cron\.alter_job\s*\(\s*job_id\s*:=\s*v_trabajo\s*,\s*active\s*:=\s*false\s*\)/i);

  /* Al ejecutar: sin secreto o con uno corto, lanza antes de llegar a pg_net. */
  const comprobacion = cuerpo.search(/if\s+v_secreto\s+is\s+null\s+or\s+length\(v_secreto\)\s*<\s*32\s+then\s+raise\s+exception/i);
  const envio = cuerpo.search(/net\.http_post/i);
  assert.ok(comprobacion >= 0, "falta la comprobación del secreto");
  assert.ok(comprobacion < envio, "la comprobación tiene que ir antes del envío");

  /* Y el error no puede incluir el valor. */
  const errores = cuerpo.match(/raise\s+(exception|warning|notice)[^;]*;/gi) || [];
  for (const error of errores) assert.doesNotMatch(error, /v_secreto/);
});

test("nadie más que el dueño puede ejecutar la función que lee el secreto", async () => {
  const sql = await leer(MIGRACION);
  const cuerpo = funcionLatir(sql);

  assert.doesNotMatch(sql, /security\s+definer/i, "no hace falta, y sería una puerta a Vault");
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+private\.latir_cola\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  );
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+private\.latir_cola/i);
  assert.doesNotMatch(cuerpo, /raise\s+(notice|log|info)/i, "nada que pueda acabar en un registro con el secreto");
});

test("los trabajos de pg_cron se gestionan con sus funciones, nunca escribiendo en cron.job", async () => {
  for (const ruta of [MIGRACION, REVERSION]) {
    const sql = await leer(ruta);
    assert.doesNotMatch(sql, /(insert\s+into|update|delete\s+from|truncate)\s+cron\.job\b/i, ruta);
  }
});

test("la migración es aditiva", async () => {
  const sql = await leer(MIGRACION);

  assert.doesNotMatch(sql, /\bdrop\s+(table|column|extension|schema|function)\b/i);
  assert.doesNotMatch(sql, /\balter\s+table\b/i);
  assert.doesNotMatch(sql, /\bpublic\.trabajos\b/i, "el latido no toca la cola, sólo la llama");
  assert.match(sql, /create extension if not exists pg_cron/i);
  assert.match(sql, /create extension if not exists pg_net/i);
});

test("revertir quita el latido sin borrar ningún trabajo ni las extensiones", async () => {
  const sql = await leer(REVERSION);

  assert.match(sql, new RegExp(`cron\\.unschedule\\s*\\(\\s*'${TRABAJO}'\\s*\\)`, "i"));
  assert.match(sql, /drop function if exists private\.latir_cola\(\)/i);
  assert.doesNotMatch(sql, /\btrabajos\b/i, "revertir no puede tocar la cola");
  assert.doesNotMatch(sql, /\b(delete|truncate)\b/i);
  assert.doesNotMatch(sql, /drop\s+(extension|table|schema)/i, "quitar pg_cron borraría otros trabajos programados");
  assert.doesNotMatch(sql, /vault\./i, "el secreto lo gestiona el propietario desde el panel");
});

test("Railway sigue siendo el respaldo durante la transición", async () => {
  /* No se retira hasta que el propietario confirme la sustitución. */
  const latido = await readFile("lib/server/latido-cola.cjs", "utf8");
  const servidor = await readFile("voice-server.js", "utf8");
  assert.match(latido, /x-nesped-internal-token/);
  assert.match(latido, /CADA_MS = Number\(process\.env\.LATIDO_COLA_MS \|\| 30_000\)/);
  assert.match(servidor, /empezarLatido\(/);
});
