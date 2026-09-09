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
 * La aplicación habla con Postgres usando la clave de servicio, que tiene
 * BYPASSRLS: las políticas de la base de datos no intervienen nunca. El
 * aislamiento entre empresas vive entero en que cada consulta lleve su
 * `.eq("client_id", …)`. Un olvido no da error, no rompe nada visible y no
 * aparece en ninguna prueba funcional: simplemente devuelve los datos de todo
 * el mundo.
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

test("toda excepción lleva su motivo escrito", () => {
  for (const [ruta, motivo] of Object.entries(CRUZAN_EMPRESAS)) {
    assert.ok(
      motivo && motivo.length > 20,
      `${ruta} necesita un motivo de verdad, no una etiqueta`
    );
  }
});

test("el envoltorio filtra por la columna correcta según la tabla", async () => {
  const { datosDeLaEmpresa } = await import("../../lib/server/datos-cliente.js");

  const llamadas = [];
  const falso = {
    from(tabla) {
      const eslabon = {
        eq(columna, valor) {
          llamadas.push({ tabla, columna, valor });
          return eslabon;
        },
      };
      return eslabon;
    },
  };

  const datos = datosDeLaEmpresa(falso, "mi-empresa");

  datos.from("leads");
  datos.from("clients");
  datos.from("una_tabla_global");

  assert.deepEqual(llamadas, [
    { tabla: "leads", columna: "client_id", valor: "mi-empresa" },
    // En `clients` la empresa ES la fila: el filtro va por id, no por client_id.
    { tabla: "clients", columna: "id", valor: "mi-empresa" },
  ]);
});

test("sin empresa no se puede construir: falla en vez de devolverlo todo", async () => {
  const { datosDeLaEmpresa } = await import("../../lib/server/datos-cliente.js");

  /* Devolver un cliente sin filtrar cuando falta la empresa sería el peor
     comportamiento posible: parecería funcionar y enseñaría los datos de
     todos. Mejor romper. */
  assert.throws(() => datosDeLaEmpresa({ from: () => {} }, ""), /empresa/i);
  assert.throws(() => datosDeLaEmpresa(null, "una-empresa"), /empresa/i);
});
