import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";

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
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    if (n === "::1" || n === "::") return true;
    if (n.startsWith("fe80")) return true;              // enlace local
    if (n.startsWith("fc") || n.startsWith("fd")) return true; // red privada
    /* IPv4 envuelta en IPv6. Hay que mirarla como lo que es o se cuela por la
       puerta de al lado, y viene en dos formas:

         ::ffff:127.0.0.1   tal cual la escribe una persona
         ::ffff:7f00:1      lo que devuelve el parser de URL, que la convierte
                            a hexadecimal por su cuenta

       La segunda es la que importa, porque es la que llega en la práctica. Se
       descubrió porque la prueba de este caso fallaba: escrita a mano pasaba
       el filtro después de que new URL() la reescribiera. */
    const decimal = n.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (decimal) return esDireccionInterna(decimal[1]);

    const hexadecimal = n.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexadecimal) {
      const alto = parseInt(hexadecimal[1], 16);
      const bajo = parseInt(hexadecimal[2], 16);
      const ipv4 = [alto >> 8, alto & 255, bajo >> 8, bajo & 255].join(".");
      return esDireccionInterna(ipv4);
    }

    // Aceptar sólo unicast global evita IPv6 local, multicast y traducciones.
    return !/^[23][0-9a-f]{3}:/.test(n) || n.startsWith("2001:db8:");
  }

  return true;
}

/**
 * @returns {Promise<{ok: true, url: URL} | {ok: false, motivo: string}>}
 */
export async function comprobarUrlExterna(valor, resolver = dns.lookup) {
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
  if (url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, motivo: "La dirección no puede incluir credenciales ni puertos alternativos." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, motivo: "Esa dirección no sale a internet." };
  }

  /* Si el host ya es una IP no hace falta resolver nada. */
  if (net.isIP(host)) {
    return esDireccionInterna(host)
      ? { ok: false, motivo: "Esa dirección no sale a internet." }
      : { ok: true, url, direcciones: [{ address: host, family: net.isIP(host) }] };
  }

  let direcciones;
  try {
    direcciones = await resolver(host, { all: true });
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

  return { ok: true, url, direcciones };
}

/** Valida DNS una vez y conecta exclusivamente a esas IP, manteniendo TLS/SNI.
 * No sigue redirecciones. El límite y el plazo cubren también el cuerpo. */
export async function peticionExternaSegura(valor, {
  method = "GET", headers = {}, body, timeoutMs = 8000, maxBytes = 64 * 1024,
} = {}, { resolver = dns.lookup, transport = https.request } = {}) {
  const startedAt = Date.now();
  let dnsTimer;
  const check = await Promise.race([
    comprobarUrlExterna(valor, resolver),
    new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("Tiempo de espera agotado")), timeoutMs); }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!check.ok) throw new Error(check.motivo);
  const { url, direcciones } = check;
  const pinnedLookup = (_hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const addresses = typeof options === "object" && options.family
      ? direcciones.filter(address => address.family === options.family) : direcciones;
    if (!addresses.length) return cb(new Error("No hay dirección permitida"));
    if (options?.all) return cb(null, addresses);
    return cb(null, addresses[0].address, addresses[0].family);
  };
  return new Promise((resolve, reject) => {
    const req = transport(url, { method, headers, lookup: pinnedLookup, agent: false }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.destroy(); req.destroy(new Error("No se permiten redirecciones")); return;
      }
      if (Number(res.headers["content-length"] || 0) > maxBytes) {
        res.destroy(); req.destroy(new Error("Respuesta demasiado grande")); return;
      }
      let size = 0;
      const chunks = [];
      res.on("data", chunk => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(); req.destroy(new Error("Respuesta demasiado grande")); }
        else chunks.push(Buffer.from(chunk));
      });
      res.on("error", error => { clearTimeout(timer); reject(error); });
      res.on("aborted", () => { clearTimeout(timer); reject(new Error("Respuesta interrumpida")); });
      res.on("end", () => {
        clearTimeout(timer);
        const status = res.statusCode || 502;
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
      });
    });
    const timer = setTimeout(() => req.destroy(new Error("Tiempo de espera agotado")), Math.max(1, timeoutMs - (Date.now() - startedAt)));
    req.on("error", error => { clearTimeout(timer); reject(error); });
    req.end(body);
  });
}
