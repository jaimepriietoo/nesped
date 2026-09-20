import { getPortalContext } from "@/lib/portal-auth";
import { consumirCodigo } from "@/lib/server/codigos-recuperacion";
import { validar } from "@/lib/server/esquemas";
import { GestionTotp } from "@/lib/server/esquemas-portal";
import {
  revocarSesionesDe,
  setAuthCookies,
} from "@/lib/server/auth";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import {
  confirmarAltaTotp,
  eliminarTotp,
  estadoTotp,
  iniciarAltaTotp,
  verificarYConsumirTotp,
} from "@/lib/server/totp";

async function contexto() {
  const ctx = await getPortalContext();
  if (!ctx.ok) return { respuesta: Response.json({ success: false, message: ctx.message }, { status: 401 }) };
  return { ctx };
}

async function registrar(ctx, action) {
  const { error } = await ctx.supabase.from("audit_logs").insert({
    client_id: ctx.clientId,
    entity_type: "auth",
    entity_id: ctx.currentUser?.id || "self",
    action,
    actor: ctx.userEmail,
    changes: {},
  });
  if (error) throw new Error("No se pudo registrar la auditoría");
}

async function renovarSesion(ctx) {
  const revocada = await revocarSesionesDe(ctx.userEmail);
  if (!revocada.ok) throw new Error("No se pudieron renovar las sesiones");
  const { data: usuario, error: userError } = await ctx.supabase.sinFiltroDeEmpresa
    .from("users").select("role,session_epoch")
    .eq("email", ctx.userEmail).eq("client_id", ctx.clientId).maybeSingle();
  const { data: empresa, error: clientError } = await ctx.supabase.sinFiltroDeEmpresa
    .from("clients").select("name").eq("id", ctx.clientId).maybeSingle();
  if (userError || clientError || !usuario) throw new Error("No se pudo renovar la sesión");
  await setAuthCookies({
    email: ctx.userEmail,
    clientId: ctx.clientId,
    role: usuario.role,
    clientName: empresa?.name || ctx.clientId,
    sessionEpoch: Number(usuario.session_epoch || revocada.epoch || 0),
  });
}

async function manejarGET() {
  try {
    const auth = await contexto();
    if (auth.respuesta) return auth.respuesta;
    const estado = await estadoTotp({ email: auth.ctx.userEmail, clientId: auth.ctx.clientId });
    return Response.json({ success: true, ...estado }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.totp_status_failed", error);
    return Response.json({ success: false, message: "No se pudo consultar TOTP" }, { status: 500 });
  }
}

async function manejarPOST(req) {
  try {
    const origen = requireSameOrigin(req);
    if (origen) return origen;
    const auth = await contexto();
    if (auth.respuesta) return auth.respuesta;
    const { ctx } = auth;
    const limite = await requireRateLimitAsync(req, {
      namespace: "portal-totp",
      limit: 10,
      windowMs: 15 * 60 * 1000,
      keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 2 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(GestionTotp, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;

    if (entrada.datos.action === "start") {
      const alta = await iniciarAltaTotp({ email: ctx.userEmail, clientId: ctx.clientId });
      await registrar(ctx, "totp_enrollment_started");
      return Response.json({ success: true, ...alta }, { headers: { "Cache-Control": "no-store" } });
    }

    if (entrada.datos.action === "confirm") {
      const confirmado = await confirmarAltaTotp({
        email: ctx.userEmail, clientId: ctx.clientId, codigo: entrada.datos.code,
      });
      if (!confirmado) return Response.json({ success: false, message: "Código TOTP incorrecto" }, { status: 401 });
      await registrar(ctx, "totp_enabled");
      await renovarSesion(ctx);
      return Response.json({ success: true, enabled: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const esRecuperacion = !/^\d{6}$/.test(entrada.datos.code);
    const valido = esRecuperacion
      ? await consumirCodigo({ email: ctx.userEmail, codigo: entrada.datos.code })
      : await verificarYConsumirTotp({
          email: ctx.userEmail, clientId: ctx.clientId, codigo: entrada.datos.code,
        });
    if (!valido) return Response.json({ success: false, message: "Código incorrecto" }, { status: 401 });
    await eliminarTotp({ email: ctx.userEmail, clientId: ctx.clientId });
    await registrar(ctx, "totp_disabled");
    await renovarSesion(ctx);
    return Response.json({ success: true, enabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.totp_update_failed", error);
    if (String(error?.message || "").includes("NESPED_TOTP_ENCRYPTION_KEY")) {
      return Response.json({ success: false, message: "TOTP no está configurado en el servidor" }, { status: 503 });
    }
    return Response.json({ success: false, message: "No se pudo actualizar TOTP" }, { status: 500 });
  }
}

export const GET = observeRoute("api.portal.totp.get", manejarGET);
export const POST = observeRoute("api.portal.totp.post", manejarPOST);
