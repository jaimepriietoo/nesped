import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { BrandingPortal } from "@/lib/server/esquemas-portal";

function withValue(value, transform = (item) => item) {
  return value === undefined ? undefined : transform(value);
}

function cleanObject(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}
 
async function manejarPATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!puede(ctx.role, "brand.manage", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos de admin" }, { status: 403 });
 
    const limited = await requireRateLimitAsync(req, {
      namespace: "portal:branding",
      limit: 30,
      keyParts: [ctx.clientId, ctx.userEmail],
      includeIp: false,
    });
    if (limited) return limited;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(BrandingPortal, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const body = leido.datos;
    const payload = cleanObject({
      brand_name: withValue(body.brand_name, (value) => String(value || "").trim()),
      brand_logo_url: withValue(body.brand_logo_url, (value) => String(value || "").trim()),
      primary_color: withValue(body.primary_color, (value) => String(value || "").trim()),
      secondary_color: withValue(body.secondary_color, (value) => String(value || "").trim()),
      industry: withValue(body.industry, (value) => String(value || "").trim()),
      logo_text: withValue(body.logo_text, (value) => String(value || "").trim()),
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
    const { error: auditError } = await ctx.datos.from("audit_logs").insert({
      entity_type: "branding",
      entity_id: ctx.clientId,
      action: "branding_updated",
      actor: ctx.userEmail,
      changes: { fields: Object.keys(body).sort() },
    });
    if (auditError) throw new Error("No se pudo auditar el cambio de marca");
    return Response.json({ success: true, message: "Branding actualizado." });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const PATCH = observeRoute("api.portal.branding.update.patch", manejarPATCH);
