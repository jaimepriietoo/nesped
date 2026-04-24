import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";

function withValue(value, transform = (item) => item) {
  return value === undefined ? undefined : transform(value);
}

function cleanObject(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}
 
export async function PATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!hasRole(ctx.role, ["owner","admin"])) return Response.json({ success: false, message: "Sin permisos de admin" }, { status: 403 });
 
    const body = await req.json();
    const payload = cleanObject({
      brand_name: withValue(body.brand_name, (value) => String(value || "").trim()),
      brand_logo_url: withValue(body.brand_logo_url, (value) => String(value || "").trim()),
      primary_color: withValue(body.primary_color, (value) => String(value || "").trim()),
      secondary_color: withValue(body.secondary_color, (value) => String(value || "").trim()),
      owner_email: withValue(body.owner_email, (value) =>
        String(value || "").trim().toLowerCase()
      ),
      industry: withValue(body.industry, (value) => String(value || "").trim()),
      logo_text: withValue(body.logo_text, (value) => String(value || "").trim()),
      custom_domain: withValue(body.custom_domain, (value) => String(value || "").trim().toLowerCase()),
      accent: withValue(body.accent, (value) => String(value || "").trim()),
      accent_text: withValue(body.accent_text, (value) => String(value || "").trim()),
      button: withValue(body.button, (value) => String(value || "").trim()),
      badge: withValue(body.badge, (value) => String(value || "").trim()),
      updated_at: new Date().toISOString(),
    });

    const { error } = await ctx.supabase
      .from("clients")
      .update(payload)
      .eq("id", ctx.clientId);
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, message: "Branding actualizado." });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
