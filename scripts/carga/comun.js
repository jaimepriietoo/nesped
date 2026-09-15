/* global __ENV */
/* =========================================================================
   Lo común a las pruebas de carga.

   Se ejecutan con k6 (https://k6.io), no con Node:

     BASE_URL=https://staging.nesped.com k6 run scripts/carga/portal.js

   Regla que no se negocia: NUNCA contra producción. Cada guion pasa por
   `destino()`, que se niega si la URL apunta a nesped.com. Un error de
   variable de entorno no puede convertirse en diez mil intentos de login
   contra la base real ni en llamadas inventadas en las cuentas de los
   clientes. Si algún día hace falta medir producción, será con lectura y con
   un guion distinto, escrito para eso.
   ========================================================================= */

const PROHIBIDOS = [/(^|\.)nesped\.com$/i, /nesped\.vercel\.app$/i];

export function destino() {
  const base = String(__ENV.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("Falta BASE_URL (por ejemplo, https://staging.nesped.com o http://localhost:3000)");
  const host = new URL(base).hostname;
  if (PROHIBIDOS.some((re) => re.test(host))) {
    throw new Error(`BASE_URL apunta a producción (${host}). Las pruebas de carga no se ejecutan contra producción.`);
  }
  return base;
}

/** Los umbrales de siempre: p95 bajo y menos de un 1 % de fallos. */
export function umbrales(p95ms = 800) {
  return {
    http_req_failed: ["rate<0.01"],
    http_req_duration: [`p(95)<${p95ms}`],
  };
}

/** Un perfil de carga suave: sube, se mantiene, baja. */
export function rampa({ hasta = 20, subida = "30s", meseta = "1m", bajada = "15s" } = {}) {
  return {
    stages: [
      { duration: subida, target: hasta },
      { duration: meseta, target: hasta },
      { duration: bajada, target: 0 },
    ],
  };
}

/** Cabeceras JSON con la cookie de sesión si la hay. */
export function cabeceras(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (__ENV.NESPED_COOKIE) h.Cookie = __ENV.NESPED_COOKIE;
  return h;
}
