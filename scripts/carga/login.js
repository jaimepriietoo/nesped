/* global __ENV */
import http from "k6/http";
import { check, sleep } from "k6";
import { destino, umbrales } from "./comun.js";

/**
 * Login con segundo factor.
 *
 * Mide lo que cuesta entrar: el hash de la contraseña, el límite de
 * peticiones en la base (consumir_limite_seguridad) y el reto de 2FA
 * (auth_challenges). Es la ruta más cara por petición y la que más cerca
 * está de fallar cerrada si la base va justa.
 *
 * Necesita una cuenta de PRUEBA en el entorno de destino:
 *   PORTAL_EMAIL, PORTAL_PASSWORD
 * y que el entorno devuelva `debugCode` (sin RESEND_API_KEY y fuera de
 * producción); si no, se mide sólo el primer paso.
 *
 * Pocos usuarios virtuales a propósito: el límite por correo (5 intentos)
 * y por IP hará que el resto sean 429, y eso es exactamente lo que se
 * quiere ver: que el límite aguanta y contesta rápido.
 */
export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURACION || "30s",
  thresholds: { ...umbrales(1500), "checks{paso:login}": ["rate>0.5"] },
};

const BASE = destino();

export default function escenario() {
  const email = __ENV.PORTAL_EMAIL;
  const password = __ENV.PORTAL_PASSWORD;
  if (!email || !password) throw new Error("Faltan PORTAL_EMAIL y PORTAL_PASSWORD (cuenta de prueba del entorno de destino)");

  const r1 = http.post(`${BASE}/api/login`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json" },
    tags: { paso: "login" },
  });
  const cuerpo = r1.json() || {};
  check(r1, {
    "login contesta 200 o 429 (límite), nunca 5xx": (r) => r.status === 200 || r.status === 429,
  }, { paso: "login" });

  if (r1.status === 200 && cuerpo.requiresTwoFactor && cuerpo.debugCode) {
    const r2 = http.post(`${BASE}/api/login/2fa`, JSON.stringify({ code: cuerpo.debugCode }), {
      headers: { "Content-Type": "application/json", Cookie: r1.cookies ? Object.entries(r1.cookies).map(([k, v]) => `${k}=${v[0].value}`).join("; ") : "" },
      tags: { paso: "2fa" },
    });
    check(r2, { "2fa entra": (r) => r.status === 200 }, { paso: "2fa" });
  }
  sleep(1);
}
