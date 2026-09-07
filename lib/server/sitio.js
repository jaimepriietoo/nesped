/**
 * Dirección canónica del sitio.
 *
 * Existe por un fallo que estaba en producción: BASE_URL apuntaba al
 * servidor de voz de Railway, así que Stripe devolvía al cliente a
 * `nesped-production.up.railway.app/portal/setup-account` después de pagar
 * —un 404— y esa persona no podía crear su cuenta. Había pagado y se
 * quedaba fuera.
 *
 * Ahora se deriva de la petición: quien está comprando vuelve exactamente al
 * sitio desde el que compró. La variable de entorno queda sólo como último
 * recurso, para procesos que corren sin petición (crons, informes).
 *
 * El host de la petición se comprueba contra una lista: sin eso, alguien
 * podría enviar una cabecera Host falsa y conseguir que un correo o una
 * redirección de Stripe apuntase a su propio dominio.
 */

const PERMITIDOS = [
  /^nesped\.com$/i,
  /^www\.nesped\.com$/i,
  /^[a-z0-9-]+\.nesped\.com$/i,
  /^[a-z0-9-]+\.vercel\.app$/i,
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/i,
];

const POR_DEFECTO =
  process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || "https://nesped.com";

function esHostFiable(host) {
  return PERMITIDOS.some((patron) => patron.test(host));
}

/**
 * @param {Request} [req] Petición en curso, si la hay.
 * @returns {string} Origen sin barra final, p. ej. "https://www.nesped.com".
 */
export function urlDeSitio(req) {
  const host = req?.headers?.get?.("host") || "";

  if (host && esHostFiable(host)) {
    const protocolo =
      req.headers.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${protocolo}://${host}`.replace(/\/+$/, "");
  }

  return String(POR_DEFECTO).replace(/\/+$/, "");
}
