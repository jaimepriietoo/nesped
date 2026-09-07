import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { validarPassword } from "@/lib/server/passwords";
import { hashPassword } from "@/lib/server/auth";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
 
export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para crear usuarios"
    );
    if (sameOriginError) return sameOriginError;

    // Aunque haga falta rol elevado, un límite corta el ruido y evita que
    // una sesión robada haga daño en masa antes de que nadie se entere.
    const limiteError = await requireRateLimitAsync(req, {
      namespace: "portal:users-create",
      limit: 15,
      windowMs: 15 * 60 * 1000,
      message: "Demasiadas altas de usuario seguidas. Espera unos minutos.",
    });
    if (limiteError) return limiteError;

    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!hasRole(ctx.role, ["owner","admin"])) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const { full_name, email, role, phone, password } = await req.json();

    // Aquí no se comprobaba nada: se podía dar de alta a alguien con la
    // contraseña "1" y ese usuario podía entrar al portal con ella.
    if (password) {
      const politica = validarPassword(password, { email });
      if (!politica.ok) {
        return Response.json({ success: false, message: politica.message }, { status: 400 });
      }
    }
    if (!full_name || !email) return Response.json({ success: false, message: "Faltan datos obligatorios" }, { status: 400 });
 
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const hashedPassword = password ? hashPassword(password) : null;
 
    const { data: user, error } = await ctx.supabase.from("portal_users").insert({
      client_id: ctx.clientId,
      full_name,
      email: normalizedEmail,
      role: role || "agent",
      phone: phone || "",
    }).select().single();
 
    if (error) throw new Error(error.message);
 
    // Also create in users table
    await ctx.supabase.from("users").upsert({
      email: normalizedEmail,
      role: role || "agent",
      client_id: ctx.clientId,
      ...(hashedPassword ? { password: hashedPassword } : {}),
    }, { onConflict: "email" });
 
    return Response.json({ success: true, data: user });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
