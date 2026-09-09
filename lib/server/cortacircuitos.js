import { getSupabase } from "@/lib/supabase";

/**
 * Cortacircuitos por proveedor externo.
 *
 * Nesped depende de cuatro empresas que se caen: Resend para el correo, Telnyx
 * para el teléfono, OpenAI para la conversación y Stripe para el cobro. Cuando
 * una falla, hoy pasa lo peor posible: se reintenta. La cola reintenta, los
 * automatismos reintentan, y cada reintento es una petición más contra un
 * servicio que ya está de rodillas, facturada igual que si hubiera funcionado.
 *
 * Esto cuenta los fallos seguidos y, pasado un número, deja de llamar durante
 * un rato. No arregla la caída de nadie: evita que la caída de otro se
 * convierta en la factura de uno y en una cola que no avanza.
 *
 * LA DECISIÓN QUE IMPORTA: un cortacircuitos abierto NO para a una persona.
 *
 * Si Resend va lento y el circuito se abre, un cortacircuitos ingenuo dejaría
 * de mandar también el código de acceso de quien está intentando entrar en ese
 * momento. Esa persona no es una tormenta: es una petición, y detrás de ella
 * hay alguien mirando la pantalla. El circuito existe para frenar volumen
 * automático —la cola, los barridos—, no para echar a nadie de su cuenta.
 *
 * Por eso cada llamada dice quién espera. Con `quienEspera: "persona"` se
 * intenta siempre, y el resultado cuenta igual para el contador. Con "nadie"
 * —que es lo normal— se respeta el circuito.
 */

/** Cuántos fallos seguidos hacen falta para abrir. */
const UMBRAL = 5;

/** Cuánto se espera la primera vez, en segundos. Después se dobla. */
const ESPERA_INICIAL = 60;

/**
 * Cuánto vale el estado leído, en milisegundos.
 *
 * Sin esto, cada llamada a un proveedor llevaría una consulta delante. Con
 * cinco segundos, una función que manda cien correos hace una consulta y no
 * cien, y lo peor que puede pasar es que durante cinco segundos se sigan
 * mandando peticiones a un proveedor recién caído. Es un precio pequeño.
 */
const CACHE_MS = 5000;

const cache = new Map();

/**
 * Marca un error como "culpa nuestra, no del proveedor".
 *
 * Es una distinción que decide si el cortacircuitos sirve para algo. Un número
 * de teléfono mal escrito, una dirección de correo inválida o un campo que
 * falta hacen que el proveedor conteste 400, y contar eso como caída abriría
 * el circuito por datos malos: un solo contacto con el teléfono mal metido
 * dejaría a toda la plataforma sin mandar mensajes.
 *
 * Lo que cuenta como caída es lo que no depende de lo que se envía: 5xx, 429,
 * y que no conteste.
 */
export function noEsDelProveedor(error) {
  if (error && typeof error === "object") error.noEsDelProveedor = true;
  return error;
}

/** Error que dice que no se llegó a intentar. La cola lo reintenta luego. */
export class ProveedorCaido extends Error {
  constructor(proveedor, hasta) {
    super(`${proveedor} está marcado como caído hasta ${hasta || "dentro de un rato"}`);
    this.name = "ProveedorCaido";
    this.proveedor = proveedor;
    this.hasta = hasta;
  }
}

async function estadoDe(proveedor) {
  const guardado = cache.get(proveedor);
  if (guardado && Date.now() - guardado.leidoEn < CACHE_MS) return guardado.estado;

  const { data } = await getSupabase()
    .from("cortacircuitos")
    .select("abierto_hasta,fallos_seguidos")
    .eq("proveedor", proveedor)
    .maybeSingle();

  const estado = data || null;
  cache.set(proveedor, { estado, leidoEn: Date.now() });
  return estado;
}

function estaAbierto(estado) {
  if (!estado?.abierto_hasta) return false;
  return new Date(estado.abierto_hasta).getTime() > Date.now();
}

/**
 * Envuelve una llamada a un proveedor externo.
 *
 * @param proveedor    Nombre corto: "resend", "telnyx", "openai", "stripe".
 * @param quienEspera  "persona" si hay alguien mirando la pantalla ahora
 *   mismo; "nadie" para trabajos de fondo. Ver el comentario de arriba.
 * @param fn           La llamada de verdad.
 */
export async function conCortacircuitos({ proveedor, quienEspera = "nadie", umbral, espera }, fn) {
  if (!proveedor) throw new Error("Un cortacircuitos necesita saber de qué proveedor es");

  const estado = await estadoDe(proveedor);

  if (estaAbierto(estado) && quienEspera !== "persona") {
    throw new ProveedorCaido(proveedor, estado.abierto_hasta);
  }

  /* Si el circuito estaba abierto y ya venció el plazo, esta llamada es la
     que comprueba si el proveedor ha vuelto. Sale sin marcar de ninguna
     forma especial: si funciona, cierra; si falla, vuelve a abrir con más
     espera. */

  try {
    const resultado = await fn();

    /* Sólo se escribe si había algo que limpiar. Un acierto tras otro acierto
       no tiene por qué costar una escritura. */
    if (estado && (estado.fallos_seguidos > 0 || estado.abierto_hasta)) {
      cache.delete(proveedor);
      await getSupabase().rpc("anotar_acierto_proveedor", { p_proveedor: proveedor });
    }

    return resultado;
  } catch (err) {
    /* Un error que es culpa de lo que se envía no dice nada sobre la salud del
       proveedor. Sale sin tocar el contador. */
    if (err?.noEsDelProveedor) throw err;

    cache.delete(proveedor);

    /* La anotación no puede tumbar la llamada: si falla el registro del fallo,
       lo que hay que propagar sigue siendo el fallo original. */
    try {
      await getSupabase().rpc("anotar_fallo_proveedor", {
        p_proveedor: proveedor,
        p_error: String(err?.message || err).slice(0, 500),
        p_umbral: umbral || UMBRAL,
        p_espera: espera || ESPERA_INICIAL,
      });
    } catch {
      /* Sin registro, el circuito no se abrirá. Es peor no propagar el error
         de verdad. */
    }

    throw err;
  }
}

/** Cómo están todos los proveedores. Para /api/ops. */
export async function estadoDeProveedores() {
  const { data } = await getSupabase()
    .from("cortacircuitos")
    .select("proveedor,fallos_seguidos,abierto_hasta,aperturas,ultimo_error,ultimo_fallo_en");

  return (data || []).map((fila) => ({
    proveedor: fila.proveedor,
    abierto: estaAbierto(fila),
    fallosSeguidos: fila.fallos_seguidos,
    abiertoHasta: fila.abierto_hasta,
    aperturas: fila.aperturas,
    ultimoError: fila.ultimo_error,
    ultimoFalloEn: fila.ultimo_fallo_en,
  }));
}

/** Se usa en las pruebas, donde el estado no puede quedarse pegado entre casos. */
export function olvidarCache() {
  cache.clear();
}

export const PARA_PRUEBAS = { UMBRAL, ESPERA_INICIAL, CACHE_MS, estaAbierto };
