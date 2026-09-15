/* global __ENV */
import http from "k6/http";
import { check, sleep } from "k6";
import { destino, umbrales } from "./comun.js";

/**
 * La cola de trabajos.
 *
 * Una sola pasada cada pocos segundos, como haría el latido de Railway, para
 * ver cuánto tarda en vaciar lo que dejó post-call.js (ejecutar antes) y que
 * dos pasadas a la vez no se pisan (tomarTrabajos usa SKIP LOCKED).
 *
 * Necesita INTERNAL_API_TOKEN del entorno de destino.
 */
export const options = {
  vus: Number(__ENV.VUS || 2),
  duration: __ENV.DURACION || "1m",
  thresholds: umbrales(5000),
};

const BASE = destino();

export default function escenario() {
  const token = __ENV.INTERNAL_API_TOKEN;
  if (!token) throw new Error("Falta INTERNAL_API_TOKEN del entorno de destino");

  const r = http.post(`${BASE}/api/cola/procesar`, null, { headers: { "x-nesped-internal-token": token } });
  check(r, {
    "cola 200": (x) => x.status === 200,
    "cola no está pausada": (x) => !(x.json() || {}).pausado,
  });
  sleep(3);
}
