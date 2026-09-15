/* =========================================================================
   Paginar por cursor.

   Las listas del portal se cortaban en N y ahí acababa todo: con quinientos
   contactos, el quinientos uno no existía. Y paginar por OFFSET no arregla
   nada: la página cien de una tabla grande le cuesta a Postgres leer las
   noventa y nueve anteriores, y si entra una fila nueva mientras tanto, la
   siguiente página repite o se salta una.

   Un cursor es "dame lo que va después de esta fila", con la fila
   identificada por (created_at, id): el orden de siempre, con el id para
   desempatar dos filas del mismo instante. Postgres lo resuelve con el
   índice, cueste lo que cueste la tabla, y la fila que entra mientras se
   pagina no mueve a las demás.

   El cursor que se entrega al cliente es opaco (base64url de un JSON con la
   fecha tal cual la devuelve la base, sin recortar microsegundos) y se
   VALIDA al volver: va dentro de un filtro `.or()` de PostgREST y una coma o
   un paréntesis colado cambiarían la consulta.
   ========================================================================= */

export class CursorInvalido extends Error {
  status = 400;
}

const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** El cursor que apunta a "después de esta fila". */
export function cursorDe(fila) {
  if (!fila?.created_at || fila?.id == null) return null;
  return Buffer.from(JSON.stringify({ t: fila.created_at, i: String(fila.id) })).toString("base64url");
}

/** Lee y valida un cursor; null si no hay; CursorInvalido si está mal. */
export function leerCursor(texto) {
  if (!texto) return null;
  let v;
  try {
    v = JSON.parse(Buffer.from(String(texto), "base64url").toString("utf8"));
  } catch {
    throw new CursorInvalido("Cursor no válido");
  }
  if (!v || typeof v.t !== "string" || typeof v.i !== "string" || !FECHA.test(v.t) || !ID.test(v.i)) {
    throw new CursorInvalido("Cursor no válido");
  }
  return v;
}

/** Cuántas filas pedir: lo que pidan, entre 1 y el máximo; por defecto 100. */
export function cuantasFilas(texto, { porDefecto = 100, maximo = 500 } = {}) {
  const n = Number.parseInt(texto, 10);
  if (!Number.isFinite(n) || n < 1) return porDefecto;
  return Math.min(n, maximo);
}

/**
 * Ejecuta una consulta paginada por cursor.
 *
 * `consulta` es un builder de supabase-js ya filtrado por empresa (y lo que
 * haga falta) pero SIN order ni limit: los pone esto. Devuelve
 * { filas, siguiente }, con `siguiente` = cursor para la página que viene, o
 * null si ésta era la última.
 */
export async function paginar(consulta, { cursor = null, cuantos = 100 } = {}) {
  const desde = typeof cursor === "string" ? leerCursor(cursor) : cursor;
  let q = consulta;
  if (desde) {
    q = q.or(`created_at.lt.${desde.t},and(created_at.eq.${desde.t},id.lt.${desde.i})`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(cuantos + 1);
  if (error) throw new Error(error.message || "No se pudo leer la lista");

  const filas = (data || []).slice(0, cuantos);
  const hayMas = (data || []).length > cuantos;
  return { filas, siguiente: hayMas ? cursorDe(filas[filas.length - 1]) : null };
}

/** La respuesta de una lista paginada, siempre con la misma forma. */
export function respuestaPaginada({ filas, siguiente }, extra = {}) {
  return Response.json({ success: true, data: filas, siguiente, ...extra });
}
