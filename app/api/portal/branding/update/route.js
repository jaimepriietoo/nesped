import { getPortalContext, hasRole } from "@/lib/portal-auth";
 
export async function PATCH(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!hasRole(ctx.role, ["owner","admin"])) return Response.json({ success: false, message: "Sin permisos de admin" }, { status: 403 });
 
    const { brand_name, brand_logo_url, primary_color, secondary_color, owner_email, industry } = await req.json();
 
    const { error } = await ctx.supabase.from("clients").update({
      brand_name, brand_logo_url, primary_color, secondary_color, owner_email, industry,
      updated_at: new Date().toISOString(),
    }).eq("id", ctx.clientId);
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, message: "Branding actualizado." });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}