/* =========================================================================
   El contexto de una operación: quién, qué petición, qué trabajo, qué empresa.

   Para que cualquier registro pueda contestar "¿qué petición era?, ¿qué
   trabajo?, ¿de qué empresa?" sin que cada sitio tenga que acordarse de
   pasar cuatro parámetros. Se abre un contexto al entrar —en observeRoute()
   para una petición, en la cola para un trabajo— y logEvent() lo lee solo.

   Es AsyncLocalStorage: el contexto sigue a la cadena de promesas sin tocar
   la firma de nada. El proxy (Edge) no abre contexto: genera el id de
   petición y lo manda en una cabecera, y observeRoute() lo recoge.
   ========================================================================= */

import { AsyncLocalStorage } from "node:async_hooks";

const almacen = new AsyncLocalStorage();

/** El nombre de la cabecera con la que el proxy marca cada petición. */
export const CABECERA_PETICION = "x-nesped-request-id";

/** Un identificador corto y legible en un registro. Web Crypto y no
    node:crypto: este módulo lo carga también el runtime Edge de Next, que
    tiene AsyncLocalStorage pero no el crypto de Node. */
export function nuevoId(prefijo = "req") {
  return `${prefijo}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** Ejecuta fn con estos valores de contexto, sumados a los que ya hubiera. */
export function conContexto(valores, fn) {
  const actual = almacen.getStore() || {};
  return almacen.run({ ...actual, ...valores }, fn);
}

/** Lo que hay en el contexto ahora mismo, o {} si no se abrió ninguno. */
export function contextoActual() {
  return almacen.getStore() || {};
}

/** Añade valores al contexto en curso: la ruta que averigua la empresa. */
export function ampliarContexto(valores) {
  const actual = almacen.getStore();
  if (actual) Object.assign(actual, valores);
}

/** El id de petición que viene del proxy, o uno nuevo si no hay proxy. */
export function idDePeticion(req) {
  const cabecera = typeof req?.headers?.get === "function" ? req.headers.get(CABECERA_PETICION) : null;
  return (cabecera && String(cabecera).slice(0, 64)) || nuevoId("req");
}
