import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { hashPassword } from "@/lib/server/auth";
 
export async function POST(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!hasRole(ctx.role, ["owner","admin"])) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const { full_name, email, role, phone, password } = await req.json();
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
