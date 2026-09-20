import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { validarPassword } from "@/lib/server/passwords";
import { hashPassword } from "@/lib/server/auth-crypto";
import { validar } from "@/lib/server/esquemas";
import {
  ActualizarUsuarioPortal,
  CrearUsuarioPortal,
  RestablecerPasswordUsuario,
} from "@/lib/server/esquemas-portal";

const ESQUEMA_POR_MODO = Object.freeze({
  create: CrearUsuarioPortal,
  update: ActualizarUsuarioPortal,
  password: RestablecerPasswordUsuario,
});

export async function gestionarUsuario(req, mode) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "users.manage", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
  const limited = await requireRateLimitAsync(req, {
    namespace: "portal:users", limit: 15, keyParts: [ctx.clientId, ctx.userEmail], includeIp: false,
  });
  if (limited) return limited;

  const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(ESQUEMA_POR_MODO[mode], cuerpo.datos);
  if (leido.respuesta) return leido.respuesta;
  let body = leido.datos;

  /* Las actualizaciones que llegan desde la tabla son parciales. El RPC
     exige el correo actual y escribe nombre/teléfono completos, así que se
     completa sólo con la fila de esta empresa antes de llamarlo. */
  if (mode === "update") {
    const { data: target, error: targetError } = await ctx.datos
      .from("portal_users")
      .select("id,email,full_name,role,phone,is_active")
      .eq("id", body.id)
      .maybeSingle();
    if (targetError || !target) {
      return Response.json(
        { success: false, message: "Usuario no disponible" },
        { status: 404 },
      );
    }
    body = { ...target, ...body, email: target.email };
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = body.password;
  if (password || mode === "password") {
    const check = validarPassword(password, { email });
    if (!check.ok) return Response.json({ success: false, message: check.message }, { status: 400 });
  }
  const { data, error } = await ctx.supabase.rpc("gestionar_usuario_portal", {
    p_mode: mode, p_client: ctx.clientId, p_actor: ctx.userEmail,
    p_id: mode === "create" ? null : body.id || body.userId,
    p_email: email, p_name: String(body.full_name || "").trim(),
    p_role: String(body.role || "agent").toLowerCase(), p_phone: String(body.phone || ""),
    p_active: body.is_active !== false, p_password: password ? hashPassword(password) : null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
    return Response.json({ success: false, message: "No se pudo aplicar el cambio. Revisa permisos, datos y que el correo esté disponible. El cambio de correo requiere soporte." }, { status });
  }
  return Response.json({ success: true, message: "Usuario actualizado correctamente", data });
}
