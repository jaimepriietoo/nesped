/**
 * Texto que ha escrito un desconocido y va a entrar en el prompt de un modelo.
 *
 * Los nombres y las necesidades de los contactos salen de lo que alguien dicta
 * por teléfono: el agente apunta lo que le dicen. Eso es entrada de un tercero,
 * exactamente igual que si viniera de un formulario público, y acaba dentro de
 * las instrucciones que lee el copiloto.
 *
 * Vive aquí y no dentro de la ruta por un motivo concreto: dentro de la ruta
 * no se podía probar. Una función pura enterrada en un fichero que importa
 * media aplicación sólo se puede verificar a mano, y una defensa que sólo se
 * verifica a mano deja de verificarse a la tercera semana.
 */

/** Cuánto texto ajeno se deja pasar. Un nombre no ocupa doscientos caracteres. */
export const LARGO_MAXIMO = 120;

/**
 * Deja un texto en condiciones de entrar en un prompt.
 *
 * Tres cosas, y cada una tapa un ataque distinto:
 *
 *  · Los saltos de línea se convierten en espacios. Son lo que permite
 *    escribir lo que parece una sección nueva del prompt.
 *  · Las marcas de sección (<<< y >>>) se neutralizan. Son las que delimitan
 *    el bloque de datos, así que dentro del bloque no pueden aparecer o se
 *    falsifica su final.
 *  · Se recorta. Quien intenta secuestrar un modelo necesita sitio para
 *    escribir sus instrucciones, y un nombre de verdad no lo necesita.
 */
export function limpiarTextoAjeno(valor, maximo = LARGO_MAXIMO) {
  return String(valor ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/<{2,}|>{2,}/g, "·")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maximo);
}

/**
 * Lo mismo sobre los valores de texto de una lista de objetos.
 *
 * Se limita a diez elementos: el modelo no necesita más para contestar, y
 * cada uno es una vía de entrada.
 */
export function limpiarItems(items = []) {
  return items.slice(0, 10).map((item) => {
    if (item == null || typeof item !== "object") return limpiarTextoAjeno(item);
    return Object.fromEntries(
      Object.entries(item).map(([clave, valor]) => [
        clave,
        typeof valor === "string" ? limpiarTextoAjeno(valor) : valor,
      ])
    );
  });
}
