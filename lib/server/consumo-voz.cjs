/**
 * Qué se le factura a una empresa por la voz sintética.
 *
 * Vive aparte del servidor de voz por un motivo concreto: lo que cuesta es el
 * texto que dice el agente, y para saber cuál es hay que reconocer la etiqueta
 * que le pone el propio servidor al apuntarlo en la transcripción. Son dos
 * sitios que tienen que coincidir exactamente.
 *
 * La primera versión no coincidía. Buscaba líneas que empezaran por "Agente:"
 * cuando la etiqueta real es "[AI] ", así que habría anotado cero caracteres
 * en todas las llamadas, para siempre, sin dar un solo error: el panel habría
 * dicho que la voz no cuesta nada mientras llegaba la factura de ElevenLabs.
 *
 * Ahora la etiqueta es una constante que usan los dos lados, y hay una prueba
 * que importa este fichero —no una copia— para que no vuelva a separarse.
 *
 * Es .cjs porque lo carga el servidor de voz, que es CommonJS.
 */

/** Cómo se marca en la transcripción lo que dice el agente. */
const ETIQUETA_AGENTE = "[AI] ";

/**
 * Los caracteres que ha sintetizado el agente en una llamada.
 *
 * No cuenta la duración: un silencio dura y no cuesta. No cuenta al cliente:
 * su voz es suya. Y descuenta la etiqueta, que no se pronuncia.
 */
function caracteresDelAgente(partes) {
  return (partes || []).reduce((total, linea) => {
    const texto = String(linea || "");
    return texto.startsWith(ETIQUETA_AGENTE)
      ? total + texto.length - ETIQUETA_AGENTE.length
      : total;
  }, 0);
}

module.exports = { ETIQUETA_AGENTE, caracteresDelAgente };
