import dns from "node:dns/promises";
import net from "node:net";

/**
 * Comprueba que una URL apunta de verdad a internet, y no a nuestra casa.
 *
 * Existe porque la prueba de webhooks del portal hacía `fetch` a la dirección
 * que le mandaras y te devolvía 1.200 caracteres de la respuesta. Eso es un
 * SSRF de manual: desde una cuenta de cliente cualquiera se podía apuntar a
 *
 *   http://localhost:3000/api/...     los endpoints internos del propio sitio
 *   http://169.254.169.254/...        el servicio de metadatos del proveedor
 *   http://10.0.0.5/...               lo que hubiera en la red privada
 *
 * y leer la respuesta. La petición sale desde nuestro servidor, así que llega
 * a sitios a los que el atacante no llega, y va firmada con nuestra identidad
 * de red. El daño real depende de qué haya escuchando dentro; la costumbre es
 * suponer que hay algo.
 *
 * Se resuelve el nombre y se miran las direcciones DEVUELTAS, no el texto del
 * host. Comprobar sólo el texto no sirve de nada: basta con registrar un
 * dominio que apunte a 127.0.0.1 y pasa el filtro.
 */

/** Rangos que no salen a internet. */
function esDireccionInterna(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);

    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 127) return true;                         // bucle local
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true;            // enlace local y metadatos
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // NAT del operador
    if (a >= 224) return true;                          // multicast y reservados
    return false;
  }

  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    if (n === "::1" || n === "::") return true;
    if (n.startsWith("fe80")) return true;              // enlace local
    if (n.startsWith("fc") || n.startsWith("fd")) return true; // red privada
    /* IPv4 envuelta en IPv6: ::ffff:127.0.0.1 llega aquí y hay que mirarla
       como lo que es, o se cuela por la puerta de al lado. */
    const envuelta = n.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (envuelta) return esDireccionInterna(envuelta[1]);
    return false;
  }

  return true;
}

/**
 * @returns {Promise<{ok: true, url: URL} | {ok: false, motivo: string}>}
 */
export async function comprobarUrlExterna(valor) {
  let url;
  try {
    url = new URL(String(valor || "").trim());
  } catch {
    return { ok: false, motivo: "Eso no es una dirección válida." };
  }

  /* Sólo https. Un webhook por http manda los datos del negocio en claro, y
     además abre la puerta a hablar con servicios internos que no tienen TLS,
     que es justo lo que se quiere evitar aquí. */
  if (url.protocol !== "https:") {
    return { ok: false, motivo: "La dirección tiene que empezar por https." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, motivo: "Esa dirección no sale a internet." };
  }

  /* Si el host ya es una IP no hace falta resolver nada. */
  if (net.isIP(host)) {
    return esDireccionInterna(host)
      ? { ok: false, motivo: "Esa dirección no sale a internet." }
      : { ok: true, url };
  }

  let direcciones;
  try {
    direcciones = await dns.lookup(host, { all: true });
  } catch {
    return { ok: false, motivo: "No se ha podido resolver ese dominio." };
  }

  if (!direcciones.length) {
    return { ok: false, motivo: "No se ha podido resolver ese dominio." };
  }

  /* Basta con que UNA de las direcciones sea interna para rechazarlo. Un
     dominio puede devolver varias y quedarse con la que le convenga. */
  if (direcciones.some((d) => esDireccionInterna(d.address))) {
    return { ok: false, motivo: "Ese dominio apunta a una dirección interna." };
  }

  return { ok: true, url };
}
