import { getSupabase } from "@/lib/supabase";
import { conCortacircuitos, noEsDelProveedor } from "@/lib/server/cortacircuitos";

/**
 * Las grabaciones, en casa.
 *
 * Hasta ahora `recording_url` guardaba la dirección que da Telnyx, y el portal
 * la pintaba directamente en un <audio src=...>. Eso tiene dos consecuencias
 * que no se ven hasta que se piensan:
 *
 *  · El navegador de quien mira va DIRECTO al proveedor, sin pasar por Nesped
 *    y sin que nadie compruebe de qué empresa es esa llamada. Para que suene,
 *    la dirección tiene que abrirse sin credenciales: cualquiera que consiga
 *    una —de un registro, de una respuesta de la API, de una copia de
 *    seguridad— escucha la conversación de un cliente ajeno.
 *  · Si se cambia de proveedor, si la cuenta se suspende un mes o si ellos
 *    rotan las direcciones, el histórico entero deja de sonar de golpe.
 *
 * Y una tercera: la retención ponía recording_url a null a los treinta días
 * mientras el audio seguía en Telnyx. El aviso legal dice que se borra. No se
 * borraba.
 *
 * Aquí la grabación se copia a un depósito privado propio, se sirve con una
 * dirección firmada que caduca, y borrarla la borra.
 */

const DEPOSITO = "grabaciones";

/**
 * Cuánto vale una dirección firmada, en segundos.
 *
 * Diez minutos: lo que dura escuchar una llamada con pausas, y lo bastante
 * poco como para que una dirección copiada por error no sirva mañana.
 */
const FIRMA_SEGUNDOS = 600;

/**
 * Dónde se guarda cada grabación. La empresa va delante para poder mirar.
 *
 * El identificador de la llamada lo pone el proveedor, así que entra por un
 * webhook y no es nuestro. Se le quita todo lo que no sea letra, cifra, punto,
 * guion o guion bajo, y además se aplastan los puntos seguidos: quitar sólo
 * las barras deja pasar `..`, y una empresa o una llamada que se llamara así
 * daría una ruta que sale de su carpeta.
 */
function rutaDe(clientId, callSid) {
  const limpio = (v) =>
    String(v || "")
      .replace(/[^A-Za-z0-9._-]/g, "")
      .replace(/\.{2,}/g, ".")
      /* Un tramo que se quede vacío haría una ruta con dos barras o que
         empieza por barra. Mejor romper que guardar en un sitio raro. */
      .replace(/^\.+|\.+$/g, "");

  const empresa = limpio(clientId);
  const llamada = limpio(callSid);

  if (!empresa || !llamada) {
    throw new Error("No se puede construir la ruta de la grabación");
  }

  return `${empresa}/${llamada}.mp3`;
}

/**
 * Copia una grabación del proveedor al depósito propio.
 *
 * Se llama desde la cola, no desde el aviso del proveedor: descargar un audio
 * y volver a subirlo tarda, y el proveedor espera una respuesta rápida a su
 * webhook. Si tarda demasiado, lo reintenta, y entonces la grabación se copia
 * dos veces.
 */
export async function copiarGrabacion({ callSid, clientId }) {
  const supabase = getSupabase();

  const { data: llamada, error } = await supabase
    .from("calls")
    .select("id,call_sid,recording_url,grabacion_propia")
    .eq("call_sid", callSid)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) throw new Error(error.message || "No se pudo leer la llamada");

  /* Ninguno de estos dos casos se arregla reintentando. */
  if (!llamada) return { copiada: false, motivo: "la llamada no existe" };
  if (llamada.grabacion_propia) return { copiada: false, motivo: "ya estaba copiada" };
  if (!llamada.recording_url) return { copiada: false, motivo: "no hay grabación que copiar" };

  const audio = await conCortacircuitos({ proveedor: "telnyx", quienEspera: "nadie" }, async () => {
    const respuesta = await fetch(llamada.recording_url, {
      /* Con techo. Una descarga colgada bloquearía el trabajo hasta que la
         cola lo diera por perdido a los quince minutos. */
      signal: AbortSignal.timeout(60_000),
    });

    if (respuesta.ok) return Buffer.from(await respuesta.arrayBuffer());

    const fallo = new Error(`El proveedor devolvió ${respuesta.status} al descargar la grabación`);
    fallo.estado = respuesta.status;

    /* Un 404 quiere decir que la grabación ya no está. Reintentarlo cinco
       veces no la va a resucitar, y no dice nada de la salud de Telnyx. */
    if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 429) {
      throw noEsDelProveedor(fallo);
    }

    throw fallo;
  });

  const ruta = rutaDe(clientId, callSid);

  const { error: errorSubida } = await supabase.storage
    .from(DEPOSITO)
    .upload(ruta, audio, { contentType: "audio/mpeg", upsert: true });

  if (errorSubida) throw new Error(errorSubida.message || "No se pudo guardar la grabación");

  const { error: errorMarca } = await supabase
    .from("calls")
    .update({ grabacion_propia: ruta, grabacion_copiada_en: new Date().toISOString() })
    .eq("id", llamada.id);

  if (errorMarca) {
    /* El audio ya está subido pero la llamada no lo sabe. Se lanza para que la
       cola reintente: el upsert hace que subirlo otra vez no duplique nada. */
    throw new Error(errorMarca.message || "No se pudo apuntar la grabación copiada");
  }

  return { copiada: true, ruta, bytes: audio.length };
}

/**
 * Una dirección para escuchar, que caduca.
 *
 * Quien llame a esto tiene que haber comprobado ya que la llamada es de la
 * empresa de quien pregunta. Esta función no lo comprueba: sólo firma.
 */
export async function direccionParaEscuchar(rutaGuardada) {
  if (!rutaGuardada) return null;

  const { data, error } = await getSupabase()
    .storage.from(DEPOSITO)
    .createSignedUrl(rutaGuardada, FIRMA_SEGUNDOS);

  if (error) throw new Error(error.message || "No se pudo firmar la grabación");
  return data?.signedUrl || null;
}

/**
 * Borra una grabación de verdad.
 *
 * La retención ponía la columna a null y se quedaba tan ancha mientras el
 * audio seguía existiendo. Esto lo quita del depósito.
 */
export async function borrarGrabacion(rutaGuardada) {
  if (!rutaGuardada) return false;
  const { error } = await getSupabase().storage.from(DEPOSITO).remove([rutaGuardada]);
  if (error) throw new Error(error.message || "No se pudo borrar la grabación");
  return true;
}

export const PARA_PRUEBAS = { rutaDe, DEPOSITO, FIRMA_SEGUNDOS };
