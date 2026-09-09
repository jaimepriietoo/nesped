import { NextResponse } from "next/server";
import { runVoiceCallsAutomation } from "@/lib/server/automation-service";
import { requireInternalRequest } from "@/lib/server/internal-api";

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
    const result = await runVoiceCallsAutomation();
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando llamadas IA",
    });
  }
}
