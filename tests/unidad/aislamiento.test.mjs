import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TABLAS_POR_EMPRESA } from "../../lib/server/datos-cliente.js";

/**
 * Que ninguna ruta consulte datos de empresa sin decir de qué empresa.
 *
 * Esta es la prueba más importante del proyecto y conviene explicar por qué.
 *
 * El filtro de aplicación sigue siendo obligatorio aunque el portal tenga
 * ahora una segunda defensa en RLS. Tener las dos permite detectar el olvido
 * aquí —en vez de esconderlo tras una respuesta vacía— y hace que Postgres lo
 * contenga si alguna consulta nueva se cuela sin `.eq("client_id", …)`.
 *
 * En una sola revisión aparecieron cinco casos, y en uno de ellos se leyeron
 * seis eventos de otra empresa con una cuenta recién creada.
 *
 * Así que se recorre el código y se comprueba. No es elegante —es análisis de
 * texto, no de sintaxis— pero cubre exactamente el fallo que ocurre y falla
 * ruidosamente cuando alguien añade una ruta nueva sin el filtro. Una prueba
 * tosca que salta vale más que una elegante que no existe.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");

/**
 * Rutas que cruzan empresas a propósito.
 *
 * Cada excepción lleva su motivo escrito. Añadir una sin justificarla es
 * exactamente lo que esta prueba viene a impedir, así que la lista es corta y
 * se lee entera de un vistazo.
 */
const CRUZAN_EMPRESAS = {
  "api/admin": "El panel de administración de Nesped: su trabajo es ver todas.",
  "api/automation": "Trabajos programados sobre toda la cartera. Solo con token interno.",
  "api/nightly": "Barrido nocturno. Solo con token interno.",
  "api/stripe": "Webhooks de Stripe: la empresa llega en los metadatos del evento.",
  "api/voice": "Webhooks de voz: la empresa se resuelve por el número llamado.",
  "api/login": "Autenticación: todavía no hay empresa que filtrar.",
  "api/registro": "Alta: la empresa se está creando en ese momento.",
  "api/logout": "Cierre de sesión: borra cookies, no consulta datos de nadie.",
  "api/session": "Lee la empresa de la sesión para devolverla.",
  "api/public-client": "Marca pública por subdominio. Solo devuelve nombre y colores.",
  "api/clients": "Ficha pública de una empresa por id, o la lista para administración.",
  "api/precios": "Precios públicos. No toca datos de nadie.",
  "api/ops": "Estado del sistema. Solo con token interno.",
  "api/cola": "El trabajador de la cola: coge trabajos de cualquier empresa. Solo con token interno.",
  "api/portal/codigos-recuperacion": "Códigos de la propia cuenta: filtra por correo de la sesión.",
};

function ficherosDeRuta() {
  const salida = [];
  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      else if (entrada.name === "route.js") salida.push(completa);
    }
  };
  recorrer(path.join(RAIZ, "app/api"));
  return salida;
}

function estaExcusada(relativa) {
  return Object.keys(CRUZAN_EMPRESAS).some((prefijo) => relativa.startsWith(prefijo));
}

/**
 * Busca consultas a una tabla de empresa y mira si en el mismo fichero hay
 * algún filtro por empresa.
 *
 * Es una comprobación por fichero y no por consulta: distinguir a qué consulta
 * pertenece cada `.eq()` exigiría analizar la sintaxis, y para lo que se busca
 * —una ruta que se olvidó el filtro por completo— basta con esto. Prefiere
 * dejar pasar un caso raro antes que gritar en falso, porque una prueba que
 * grita en falso acaba desactivada.
 */
function consultaSinEmpresa(codigo) {
  const tablas = [...codigo.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)]
    .map((m) => m[1])
    .filter((t) => TABLAS_POR_EMPRESA.has(t));

  if (!tablas.length) return null;

  const filtra =
    /\.eq\(\s*["'`]client_id["'`]/.test(codigo) ||
    /client_id:\s*/.test(codigo) ||
    /datosDeLaEmpresa|ctx\.datos/.test(codigo) ||
    /exigirContactoPropio/.test(codigo);

  return filtra ? null : [...new Set(tablas)];
}

test("ninguna ruta lee datos de empresa sin filtrar por empresa", () => {
  const culpables = [];

  for (const fichero of ficherosDeRuta()) {
    const relativa = path.relative(path.join(RAIZ, "app"), fichero).replace(/\/route\.js$/, "");
    if (estaExcusada(relativa)) continue;

    const tablas = consultaSinEmpresa(fs.readFileSync(fichero, "utf8"));
    if (tablas) culpables.push(`${relativa} → ${tablas.join(", ")}`);
  }

  assert.deepEqual(
    culpables,
    [],
    "Estas rutas consultan datos de empresa sin filtro:\n  " +
      culpables.join("\n  ") +
      "\n\nSi la ruta debe cruzar empresas a propósito, añádela a CRUZAN_EMPRESAS con su motivo."
  );
});

/**
 * La prueba anterior detecta olvidos por fichero. Esta segunda red mira cada
 * cadena construida con el cliente sin envolver: que otra consulta del mismo
 * fichero sí filtre no puede ocultar una consulta insegura distinta.
 */
test("cada consulta cruda del portal lleva su propio filtro de empresa", () => {
  const culpables = [];
  const tablas = new Set([...TABLAS_POR_EMPRESA, "clients"]);

  for (const fichero of ficherosDeRuta().filter((ruta) => ruta.includes(`${path.sep}api${path.sep}portal${path.sep}`))) {
    const codigo = fs.readFileSync(fichero, "utf8");
    const patron = /ctx\.supabase\s*\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
    const coincidencias = [...codigo.matchAll(patron)];

    for (let indice = 0; indice < coincidencias.length; indice += 1) {
      const coincidencia = coincidencias[indice];
      const tabla = coincidencia[1];
      if (!tablas.has(tabla)) continue;

      const siguiente = coincidencias[indice + 1]?.index ?? codigo.length;
      const puntoYComa = codigo.indexOf(";", coincidencia.index);
      const final = Math.min(puntoYComa === -1 ? codigo.length : puntoYComa, siguiente);
      const consulta = codigo.slice(coincidencia.index, final);
      const filtro = tabla === "clients"
        ? /\.eq\(\s*["'`]id["'`]\s*,\s*ctx\.clientId\s*\)/
        : /\.eq\(\s*["'`]client_id["'`]\s*,\s*ctx\.clientId\s*\)|client_id\s*:\s*ctx\.clientId/;

      if (!filtro.test(consulta)) {
        culpables.push(
          `${path.relative(RAIZ, fichero)}:${codigo.slice(0, coincidencia.index).split("\n").length} → ${tabla}`
        );
      }
    }
  }

  assert.deepEqual(
    culpables,
    [],
    "Estas consultas usan ctx.supabase sin acotarse en su propia cadena:\n  " + culpables.join("\n  ")
  );
});

test("toda excepción lleva su motivo escrito", () => {
  for (const [ruta, motivo] of Object.entries(CRUZAN_EMPRESAS)) {
    assert.ok(
      motivo && motivo.length > 20,
      `${ruta} necesita un motivo de verdad, no una etiqueta`
    );
  }
});

/*
 * Con el cliente REAL de supabase-js, no con un doble.
 *
 * La versión anterior de esta prueba usaba un cliente de mentira que tenía
 * `.eq()` nada más salir de `.from()`. El real no lo tiene —`.eq()` aparece
 * después de `.select()`/`.update()`/…— y el envoltorio reventaba en la
 * primera consulta de verdad. La prueba estaba en verde y el código no
 * funcionaba: exactamente lo que una prueba con dobles puede esconder. Aquí
 * se construye un cliente real apuntando a ninguna parte y se mira la
 * consulta que PostgREST enviaría, sin enviarla.
 */
async function clienteReal() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient("https://sin-salida.supabase.co", "clave-de-prueba");
}

/* La URL que saldría hacia PostgREST: es donde se ve el filtro. */
const urlDe = (consulta) => String(consulta.url);

test("el envoltorio filtra por la columna correcta según la tabla, con el cliente real", async () => {
  const { datosDeLaEmpresa } = await import("../../lib/server/datos-cliente.js");
  const datos = datosDeLaEmpresa(await clienteReal(), "mi-empresa");

  assert.match(urlDe(datos.from("leads").select("*")), /client_id=eq\.mi-empresa/);
  // En `clients` la empresa ES la fila: el filtro va por id, no por client_id.
  assert.match(urlDe(datos.from("clients").select("id")), /id=eq\.mi-empresa/);
  // Y una tabla global pasa sin tocar.
  assert.doesNotMatch(urlDe(datos.from("cortacircuitos").select("*")), /mi-empresa/);

  // update y delete llevan el filtro igual: no se puede tocar lo de otros.
  assert.match(urlDe(datos.from("leads").update({ status: "won" })), /client_id=eq\.mi-empresa/);
  assert.match(urlDe(datos.from("leads").delete()), /client_id=eq\.mi-empresa/);

  // Se puede seguir encadenando después, que es lo que hacen las rutas.
  const encadenada = datos.from("leads").select("*").eq("status", "new").order("created_at");
  assert.match(urlDe(encadenada), /client_id=eq\.mi-empresa/);
  assert.match(urlDe(encadenada), /status=eq\.new/);
});

test("insertar y upsert escriben la empresa en la fila, y no dejan escribir en otra", async () => {
  const { datosDeLaEmpresa } = await import("../../lib/server/datos-cliente.js");
  const datos = datosDeLaEmpresa(await clienteReal(), "mi-empresa");

  const cuerpoDe = (consulta) => consulta.body;

  assert.deepEqual(cuerpoDe(datos.from("leads").insert({ nombre: "Ana" })), { nombre: "Ana", client_id: "mi-empresa" });
  assert.deepEqual(
    cuerpoDe(datos.from("leads").insert([{ nombre: "Ana" }, { nombre: "Bea" }])),
    [{ nombre: "Ana", client_id: "mi-empresa" }, { nombre: "Bea", client_id: "mi-empresa" }],
  );
  assert.deepEqual(cuerpoDe(datos.from("lead_memory").upsert({ lead_id: "x" })), { lead_id: "x", client_id: "mi-empresa" });

  // Una fila que ya trae OTRA empresa no se corrige en silencio: se lanza.
  assert.throws(() => datos.from("leads").insert({ nombre: "Ana", client_id: "otra" }), /otra empresa/);
});

test("sin empresa no se puede construir: falla en vez de devolverlo todo", async () => {
  const { datosDeLaEmpresa } = await import("../../lib/server/datos-cliente.js");

  /* Devolver un cliente sin filtrar cuando falta la empresa sería el peor
     comportamiento posible: parecería funcionar y enseñaría los datos de
     todos. Mejor romper. */
  assert.throws(() => datosDeLaEmpresa({ from: () => {} }, ""), /empresa/i);
  assert.throws(() => datosDeLaEmpresa(null, "una-empresa"), /empresa/i);
});
