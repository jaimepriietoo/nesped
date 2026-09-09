import { getSupabase } from "@/lib/supabase";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { observeRoute } from "@/lib/server/observability.mjs";

/**
 * Los números que dicen cuándo hay que tirar de cada palanca.
 *
 * La hoja de ruta de la auditoría decía "particionar", "réplicas de lectura" y
 * "repartir por fragmentos" para cuando haya entre 50.000 y 200.000 empresas.
 * Eso no es un plan: es una lista de deseos con un número al lado que nadie
 * sabe medir.
 *
 * Un plan así se cumple tarde o pronto, y las dos son caras. Pronto es
 * complicar un producto de cinco clientes con particiones que no hacen nada.
 * Tarde es descubrir que hacía falta particionar el día que la tabla tiene
 * cien millones de filas y ya no se puede sin parar el servicio.
 *
 * Esta ruta mide, y cada aviso trae escrita la palanca que le corresponde. Lo
 * normal, y lo que contesta hoy, es que no haya nada que hacer.
 */
async function handleGet(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  const { data, error } = await getSupabase().rpc("salud_de_la_base");

  if (error) {
    return Response.json(
      { success: false, message: error.message || "No se pudo medir" },
      { status: 500 }
    );
  }

  return Response.json({ success: true, data });
}

export const GET = observeRoute("api.ops.salud.get", handleGet);
