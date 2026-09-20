import { getAdminContext } from "@/lib/server/auth";
import { getSupabase } from "@/lib/supabase";
import { validar } from "@/lib/server/esquemas";
import { InterruptoresAdmin } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import {
  interruptoresDePlataforma, interruptoresDeEmpresa,
  fijarInterruptoresDePlataforma, fijarInterruptoresDeEmpresa,
} from "@/lib/server/interruptores";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

/**
 * Los interruptores de emergencia, desde la administración de Nesped.
 *
 * GET  → el estado de los de plataforma y, con ?empresa=, los de una empresa.
 * POST → cambiarlos. Cuerpo:
 *   { pausa_global?, pausa_ia?, pausa_llamadas?, motivo? }            plataforma
 *   { empresa, ia_pausada?, llamadas_pausadas? }                       una empresa
 *
 * Es deliberadamente simple: la gracia de un interruptor de emergencia es
 * que se pueda pulsar en segundos sin desplegar nada. Cada cambio queda en
 * audit_logs con quién lo pulsó.
 */
async function manejarGET(req) {
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });

  const empresa = new URL(req.url).searchParams.get("empresa");
  const plataforma = await interruptoresDePlataforma({ fresco: true });
  const deEmpresa = empresa ? await interruptoresDeEmpresa(empresa, { fresco: true }) : null;
  return Response.json({ success: true, data: { plataforma, empresa: deEmpresa } }, { headers: { "Cache-Control": "no-store" } });
}

async function manejarPOST(req) {
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const limite = await requireRateLimitAsync(req, {
    namespace: "admin-interruptores",
    limit: 60,
    keyParts: [admin.userEmail || "admin"],
  });
  if (limite) return limite;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const entrada = validar(InterruptoresAdmin, cuerpo.datos);
  if (entrada.respuesta) return entrada.respuesta;
  const body = entrada.datos;
  const actor = admin.userEmail || "admin";

  try {
    let resultado;
    if (body.empresa) {
      const empresa = String(body.empresa).trim();
      resultado = await fijarInterruptoresDeEmpresa(empresa, body);
      const { error: auditError } = await getSupabase().from("audit_logs").insert({
        client_id: empresa, entity_type: "interruptores", entity_id: empresa,
        action: "interruptores_empresa", actor,
        changes: { fields: Object.keys(body).filter((campo) => campo !== "empresa").sort() },
      });
      if (auditError) throw new Error("No se pudo registrar la auditoría");
    } else {
      resultado = await fijarInterruptoresDePlataforma(body, { actor });
      const { error: auditError } = await getSupabase().from("audit_logs").insert({
        client_id: null, entity_type: "interruptores", entity_id: "plataforma",
        action: "interruptores_plataforma", actor,
        changes: { fields: Object.keys(body).sort() },
      });
      if (auditError) throw new Error("No se pudo registrar la auditoría");
    }
    return Response.json({ success: true, data: resultado }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logErrorSeguro("admin.interruptores_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.admin.interruptores.get", manejarGET);
export const POST = observeRoute("api.admin.interruptores.post", manejarPOST);
