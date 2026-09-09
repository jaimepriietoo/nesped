import { createClient } from "@supabase/supabase-js";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { requireInternalRequest } from "@/lib/server/internal-api";

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
export async function POST(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    const supabase = getSupabase();

    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .eq("auto_mode", true);

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    // De momento solo recalcula, no ejecuta automáticamente.
    for (const lead of leads || []) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/next-best-action/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getInternalApiHeaders(),
        },
        body: JSON.stringify({
          leadId: lead.id,
          clientId: lead.client_id,
          brandName: "Nesped",
        }),
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error ejecutando automatización NBA" },
      { status: 500 }
    );
  }
}
