import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { hashPassword, verifyPassword } from "@/lib/server/auth";

/**
 * Códigos de recuperación: entrar cuando el segundo factor no llega.
 *
 * El código de acceso va por correo. Si el correo no sale —el proveedor caído,
 * el dominio que deja de verificarse, la cuenta suspendida— nadie entra al
 * portal. Ninguno. Y eso incluye a quien tendría que arreglarlo.
 *
 * Había un respaldo por SMS, pero comprobado en producción no puede
 * dispararse: cero de los seis usuarios tiene móvil guardado y no hay número
 * desde el que enviar. Existe en el código y no en la realidad, que es la
 * peor clase de plan B.
 *
 * Añadir un segundo proveedor de envío sólo mueve el problema: también se
 * cae, y encima hay que pagarlo. Estos códigos no dependen de nadie.
 *
 * Cómo funcionan:
 *
 *  · Se generan diez de golpe y se enseñan UNA vez. No se pueden volver a
 *    ver, porque sólo se guarda su hash.
 *  · Cada uno vale para una entrada. Al usarse queda marcado.
 *  · Generar otra tanda invalida la anterior entera. Es lo que se espera de
 *    "renovar mis códigos", y evita que queden llaves antiguas por ahí.
 */

/** Cuántos se dan de una vez. Diez cubre años de caídas puntuales. */
const CUANTOS = 10;

/**
 * El alfabeto excluye las letras y cifras que se confunden al copiarlas a
 * mano: I, l, 1, O, 0. Estos códigos se apuntan en un papel o en un gestor de
 * contraseñas, y se teclean el día que algo va mal y con prisa.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generarUno() {
  const bytes = crypto.randomBytes(10);
  let codigo = "";
  for (let i = 0; i < 10; i += 1) {
    codigo += ALFABETO[bytes[i] % ALFABETO.length];
    if (i === 4) codigo += "-";
  }
  return codigo;
}

function normalizar(valor) {
  return String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Genera una tanda nueva e invalida la anterior.
 *
 * @returns {Promise<string[]>} Los códigos en claro. Es la única vez que
 *   existen fuera de la cabeza de quien los guarda.
 */
export async function generarCodigos({ email, clientId }) {
  const supabase = getSupabase();
  const correo = String(email || "").trim().toLowerCase();
  if (!correo) throw new Error("Falta el correo");

  /* Se borran los anteriores, incluidos los ya usados: dejar el histórico no
     aporta nada y son hashes de llaves. */
  await supabase.from("codigos_recuperacion").delete().eq("email", correo);

  const codigos = Array.from({ length: CUANTOS }, generarUno);

  const { error } = await supabase.from("codigos_recuperacion").insert(
    codigos.map((codigo) => ({
      email: correo,
      client_id: clientId || null,
      hash: hashPassword(normalizar(codigo)),
    }))
  );

  if (error) throw new Error(error.message || "No se pudieron generar los códigos");

  return codigos;
}

/**
 * Comprueba un código y lo gasta.
 *
 * Devuelve true sólo si era válido y estaba sin usar. Hay que recorrer los
 * pendientes comparando hashes porque el hash lleva sal: no se puede buscar
 * por igualdad. Son diez como mucho, así que el coste es irrelevante y a
 * cambio los códigos no se guardan en claro.
 */
export async function consumirCodigo({ email, codigo }) {
  const supabase = getSupabase();
  const correo = String(email || "").trim().toLowerCase();
  const limpio = normalizar(codigo);

  /* Un código tiene diez caracteres. Comprobarlo antes evita recorrer la
     tabla por cada intento de fuerza bruta con basura. */
  if (!correo || limpio.length !== 10) return false;

  const { data } = await supabase
    .from("codigos_recuperacion")
    .select("id,hash")
    .eq("email", correo)
    .is("usado_en", null);

  for (const fila of data || []) {
    if (!verifyPassword(limpio, fila.hash)) continue;

    /* Se marca gastado condicionando a que siga sin usar: si dos peticiones
       llegan con el mismo código a la vez, sólo una lo consume. */
    const { data: gastado } = await supabase
      .from("codigos_recuperacion")
      .update({ usado_en: new Date().toISOString() })
      .eq("id", fila.id)
      .is("usado_en", null)
      .select("id");

    return Array.isArray(gastado) && gastado.length > 0;
  }

  return false;
}

/** Cuántos quedan sin usar, para poder avisar cuando se acaben. */
export async function codigosDisponibles(email) {
  const { count } = await getSupabase()
    .from("codigos_recuperacion")
    .select("*", { count: "exact", head: true })
    .eq("email", String(email || "").trim().toLowerCase())
    .is("usado_en", null);

  return count || 0;
}
