import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

/**
 * El panel que ve todas las empresas de golpe.
 *
 * Antes esto pedía TODAS las llamadas, TODOS los contactos y TODOS los
 * usuarios de TODAS las empresas, y después, por cada empresa, recorría los
 * tres arrays enteros buscando los suyos. Con seis empresas y veintinueve
 * llamadas era instantáneo; con doscientas empresas y cien mil llamadas son
 * veinte millones de comparaciones y la base de datos entera en la memoria de
 * una función que tiene 1 GB.
 *
 * Ahora cuenta Postgres, que para eso está, y devuelve las empresas de cien
 * en cien. El cursor es el id de la última: no se salta ni repite filas
 * aunque se cree una empresa mientras se pagina, que es lo que pasa con
 * `offset`.
 */

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Cuántas empresas por página. Se puede pedir menos, no más. */
const POR_PAGINA = 100;

export async function GET(req) {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const url = new URL(req.url);
    const pedido = Number(url.searchParams.get("limite"));
    const limite = Number.isFinite(pedido) && pedido > 0
      ? Math.min(pedido, POR_PAGINA)
      : POR_PAGINA;

    /* El cursor viene de la respuesta anterior. Se pasa tal cual: es un id de
       empresa, y la función solo lo usa para comparar. */
    const desde = url.searchParams.get("desde") || null;

    const { data, error } = await getSupabase().rpc("resumen_de_empresas", {
      p_limite: limite,
      p_desde: desde,
    });

    if (error) {
      return Response.json(
        { success: false, message: error.message || "Error cargando super dashboard" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      /* Null a partir de la segunda página, a propósito: los totales globales
         no cambian mientras se pagina y volver a contarlos era más de la mitad
         del coste de cada página. Medido con 506 empresas: 13,5 ms por página
         de los que 7,4 eran recontar lo mismo. Quien pagina se queda con los
         de la primera respuesta. */
      metrics: data?.metrics ?? null,
      clients: data?.clients || [],
      /* Null cuando ya no quedan más. El panel deja de pedir cuando lo ve. */
      cursor: data?.cursor || null,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando super dashboard" },
      { status: 500 }
    );
  }
}
