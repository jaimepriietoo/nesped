import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { validarPassword } from "@/lib/server/passwords";
import { hashPassword } from "@/lib/server/auth-crypto";

export async function gestionarUsuario(req, mode) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const ctx = await getPortalContext();
  if (!ctx.ok) return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  if (!puede(ctx.role, "users.manage")) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
  const limited = await requireRateLimitAsync(req, {
    namespace: "portal:users", limit: 15, keyParts: [ctx.clientId, ctx.userEmail], includeIp: false,
  });
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = body.password;
  if (password || mode === "password") {
    const check = validarPassword(password, { email });
    if (!check.ok) return Response.json({ success: false, message: check.message }, { status: 400 });
  }
  const { data, error } = await ctx.supabase.rpc("gestionar_usuario_portal", {
    p_mode: mode, p_client: ctx.clientId, p_actor: ctx.userEmail,
    p_id: mode === "create" ? null : body.id || body.userId || null,
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
