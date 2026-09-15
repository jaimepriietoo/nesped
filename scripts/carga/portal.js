/* global __ENV */
import http from "k6/http";
import { check, sleep } from "k6";
import { destino, umbrales, rampa, cabeceras } from "./comun.js";

/**
 * El portal: la vista general y las listas por cursor.
 *
 * /api/portal/overview es la ruta más visitada y la que más consultas hace
 * (una decena, en paralelo, más dos RPC). Después se recorren contactos y
 * llamadas por cursor hasta el final o hasta PAGINAS páginas.
 *
 * Necesita una sesión ya abierta en el entorno de destino:
 *   NESPED_COOKIE="nesped_session=...; nesped_role=..."
 * (copiarla del navegador tras entrar con la cuenta de prueba). Con datos
 * sintéticos: para que la paginación signifique algo, la empresa de prueba
 * debería tener más de 500 contactos y 300 llamadas.
 */
export const options = {
  ...rampa({ hasta: Number(__ENV.VUS || 20) }),
  thresholds: {
    ...umbrales(1200),
    "http_req_duration{ruta:overview}": ["p(95)<1500"],
    "http_req_duration{ruta:contactos}": ["p(95)<600"],
  },
};

const BASE = destino();
const PAGINAS = Number(__ENV.PAGINAS || 5);

function recorrer(ruta) {
  let cursor = null;
  for (let i = 0; i < PAGINAS; i += 1) {
    const url = `${BASE}/api/portal/${ruta}?cuantos=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = http.get(url, { headers: cabeceras(), tags: { ruta } });
    const ok = check(r, { [`${ruta} 200`]: (x) => x.status === 200 });
    if (!ok) return;
    cursor = (r.json() || {}).siguiente;
    if (!cursor) return;
  }
}

export default function escenario() {
  if (!__ENV.NESPED_COOKIE) throw new Error("Falta NESPED_COOKIE (la cookie de una sesión del entorno de destino)");

  const r = http.get(`${BASE}/api/portal/overview`, { headers: cabeceras(), tags: { ruta: "overview" } });
  check(r, {
    "overview 200": (x) => x.status === 200,
    "overview trae leads": (x) => Array.isArray((x.json() || {}).leads),
  });
  sleep(0.5);
  recorrer("contactos");
  recorrer("llamadas");
  sleep(1);
}
