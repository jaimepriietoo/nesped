import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

/**
 * Las cifras globales de Nesped y las últimas llamadas.
 *
 * Antes esto pedía TODAS las llamadas y TODOS los contactos de TODAS las
 * empresas para sacar seis números y enseñar doce llamadas. Y una llamada
 * incluye su transcripción entera, que es la columna más grande que hay: la
 * conversación completa de cada cliente de cada empresa viajaba por la red
 * para terminar en un `.length`.
 *
 * Ahora las cifras las cuenta Postgres y de las llamadas se piden doce, con
 * las columnas que se pintan.
 */

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Cuántas llamadas recientes se enseñan. Lo que cabe en la pantalla. */
const RECIENTES = 12;

/* La transcripción no está: es lo más pesado de la tabla y esta pantalla no
   la pinta. Quien quiera leerla abre la llamada. */
const COLUMNAS_RECIENTES = [
  "id",
  "client_id",
  "created_at",
  "status",
  "summary",
  "lead_captured",
  "duration_seconds",
  "call_outcome",
  "detected_intent",
].join(",");

export async function GET() {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();

    const [resumenRes, recientesRes] = await Promise.all([
      supabase.rpc("resumen_global"),
      supabase
        .from("calls")
        .select(COLUMNAS_RECIENTES)
        .order("created_at", { ascending: false })
        .limit(RECIENTES),
    ]);

    const error = resumenRes.error || recientesRes.error;
    if (error) {
      return Response.json(
        { success: false, message: error.message || "Error cargando dashboard" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      metrics: resumenRes.data || {},
      recentCalls: recientesRes.data || [],
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando dashboard" },
      { status: 500 }
    );
  }
}
