import { createClient } from "@supabase/supabase-js";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { leerJsonLimitado } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { RecalcularAcciones } from "@/lib/server/esquemas-operaciones";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/*
 * Tarea de sistema: sólo se lanza desde dentro, con el token interno.
 *
 * Antes valía también una sesión de portal con rol owner, admin o manager, y
 * eso era un problema serio: estas tareas recorren los contactos de TODAS las
 * empresas —getAllLeadsForAutomation() no filtra por cliente— y desde ahí
 * mandan mensajes, hacen llamadas y escriben en sus fichas.
 *
 * O sea que cualquier cliente podía disparar mensajería saliente a los
 * contactos de todos los demás. No hay ninguna pantalla que las llame: son
 * trabajos programados, y como tales se cierran.
 */
async function manejarPOST(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 2 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(RecalcularAcciones, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const onlyClientId = leido.datos.clientId || null;

    const supabase = getSupabase();

    let query = supabase
      .from("leads")
      .select("id, client_id, status")
      .not("status", "in", '("won","lost")');

    if (onlyClientId) {
      query = query.eq("client_id", onlyClientId);
    }

    const { data: leads, error } = await query.limit(1000);

    if (error) {
      return Response.json(
        { success: false, message: "No se pudo completar la operación" },
        { status: 500 }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const lead of leads || []) {
      try {
        await saveNextBestAction({
          supabase,
          leadId: lead.id,
          clientId: lead.client_id,
          useAI: true,
          actor: "system",
        });
        processed += 1;
      } catch {
        failed += 1;
      }
    }

    return Response.json({
      success: true,
      processed,
      failed,
      total: (leads || []).length,
    });
  } catch (error) {
    logErrorSeguro("automation.recalculate_next_actions_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error recalculando acciones recomendadas",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.automation.recalculate-next-actions.post", manejarPOST);
