/**
 * Leer la sesión desde el middleware, comprobando la firma.
 *
 * El middleware decidía quién entra en /admin mirando la cookie
 * `nesped_role`, que va en claro y sin firmar. Cualquiera podía abrir las
 * herramientas del navegador, escribir `nesped_role=admin` y pasar el
 * control.
 *
 * No llegaba a ser una fuga de datos —las APIs de administración comprueban
 * el token firmado y habrían devuelto 401— pero el filtro del middleware era
 * decorativo, y esa es la peor clase de control de acceso: el que parece que
 * está y no está. La primera página de administración que pinte algo en el
 * servidor sin comprobar por su cuenta lo enseñaría.
 *
 * Aquí se verifica la firma del token de verdad. El middleware corre en el
 * runtime Edge, donde no existe el módulo `crypto` de Node, así que se usa
 * Web Crypto, que sí está y hace exactamente lo mismo.
 *
 * Esto NO sustituye a la comprobación del servidor: es la primera puerta, no
 * la única. Cada API sigue validando por su cuenta, y además contra la
 * generación de sesión guardada en la base de datos, que el middleware no
 * puede consultar.
 */

const COOKIE_SESION = "nesped_session";
const MARGEN_RELOJ_MS = 60 * 1000;

function decodificarBase64Url(valor) {
  const normalizado = String(valor).replace(/-/g, "+").replace(/_/g, "/");
  const relleno = normalizado + "=".repeat((4 - (normalizado.length % 4)) % 4);
  const binario = atob(relleno);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function aBase64Url(buffer) {
  let binario = "";
  for (const b of new Uint8Array(buffer)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function secreto() {
  return (
    process.env.NESPED_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

/**
 * Devuelve el contenido de la sesión si la firma es válida y no ha caducado.
 * Devuelve null en cualquier otro caso, sin distinguir el motivo: a quien
 * está probando no se le explica por qué ha fallado.
 */
export async function leerSesionFirmada(req) {
  try {
    const token = req.cookies.get(COOKIE_SESION)?.value;
    if (!token || !token.includes(".")) return null;

    const clave = secreto();
    if (!clave) return null;

    const [cuerpo, firma] = token.split(".");
    if (!cuerpo || !firma) return null;

    const codificador = new TextEncoder();
    const llave = await crypto.subtle.importKey(
      "raw",
      codificador.encode(clave),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    /* Se firma y se compara, en vez de usar verify() con la firma recibida,
       porque así el resultado es un base64url idéntico al que genera el
       servidor y no hay que traducir formatos entre los dos sitios. */
    const esperada = aBase64Url(
      await crypto.subtle.sign("HMAC", llave, codificador.encode(cuerpo))
    );

    if (esperada.length !== firma.length) return null;

    /* Comparación de tiempo constante. Sobre una firma de 43 caracteres el
       ahorro práctico de una salida temprana es mínimo, pero comparar
       credenciales con === es la costumbre que acaba mordiendo en el sitio
       donde sí importa. */
    let iguales = 0;
    for (let i = 0; i < firma.length; i += 1) {
      iguales |= esperada.charCodeAt(i) ^ firma.charCodeAt(i);
    }
    if (iguales !== 0) return null;

    const datos = JSON.parse(decodificarBase64Url(cuerpo));
    const ahora = Date.now();
    const emitido = Number(datos?.issuedAt || 0);
    const caduca = Number(datos?.expiresAt || 0);

    if (!emitido || emitido > ahora + MARGEN_RELOJ_MS) return null;
    if (caduca && caduca < ahora) return null;

    return datos;
  } catch {
    return null;
  }
}
