/**
 * Política de contraseñas, en un solo sitio.
 *
 * Estaba repartida y descuadrada: el reinicio exigía 8 caracteres, el alta
 * de cuenta 6, y la creación de usuarios desde el portal no comprobaba nada
 * —se podía dar de alta a alguien con la contraseña "1"—.
 *
 * El criterio sigue a las recomendaciones actuales del NIST: manda la
 * longitud, no los símbolos raros. Obligar a mayúsculas y signos produce
 * contraseñas peores y más difíciles de recordar; lo que de verdad protege
 * es que sea larga y que no esté en las listas de las más usadas.
 */

const MINIMO = 10;
const MAXIMO = 200;

/**
 * Las que aparecen primero en cualquier lista de filtraciones. No es una
 * lista exhaustiva —eso es trabajo de un servicio externo— pero corta el
 * caso más común: alguien con prisa poniendo "Password123".
 */
const PROHIBIDAS = new Set([
  "contrasena", "contraseña", "password", "password1", "password123",
  "12345678", "123456789", "1234567890", "qwertyuiop", "administrador",
  "adminadmin", "nesped", "nesped123", "nesped2024", "nesped2025",
  "bienvenido", "bienvenido1", "iloveyou", "sunshine", "princess",
  "abcd1234", "asdfghjkl", "letmein123", "changeme", "cambiame",
]);

/** Detecta secuencias tipo "aaaaaaaaaa" o "1234567890". */
function esDemasiadoSimple(clave) {
  const bajo = clave.toLowerCase();

  if (/^(.)\1+$/.test(bajo)) return true;

  const ascendente = "abcdefghijklmnopqrstuvwxyz";
  const numeros = "01234567890";
  for (const serie of [ascendente, numeros]) {
    if (serie.includes(bajo) || [...serie].reverse().join("").includes(bajo)) {
      return true;
    }
  }

  // Menos de cinco caracteres distintos en algo largo es un patrón, no una
  // contraseña: "abababababab".
  return new Set(bajo).size < 5;
}

/**
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function validarPassword(valor, { email = "" } = {}) {
  const clave = String(valor ?? "");

  if (clave.length < MINIMO) {
    return { ok: false, message: `La contraseña necesita al menos ${MINIMO} caracteres.` };
  }

  // Un límite alto evita que una contraseña enorme convierta cada intento de
  // acceso en trabajo de CPU: scrypt cuesta más cuanto más larga es.
  if (clave.length > MAXIMO) {
    return { ok: false, message: `La contraseña no puede pasar de ${MAXIMO} caracteres.` };
  }

  if (clave.trim().length !== clave.length) {
    return { ok: false, message: "La contraseña no puede empezar ni acabar con espacios." };
  }

  const bajo = clave.toLowerCase();

  if (PROHIBIDAS.has(bajo)) {
    return { ok: false, message: "Esa contraseña es de las más usadas del mundo. Elige otra." };
  }

  if (esDemasiadoSimple(clave)) {
    return { ok: false, message: "La contraseña es demasiado repetitiva o secuencial." };
  }

  // Que la contraseña sea el propio correo es sorprendentemente frecuente.
  const usuario = String(email || "").split("@")[0].toLowerCase();
  if (usuario.length >= 4 && bajo.includes(usuario)) {
    return { ok: false, message: "La contraseña no puede contener tu dirección de correo." };
  }

  return { ok: true };
}

export const LONGITUD_MINIMA_PASSWORD = MINIMO;
