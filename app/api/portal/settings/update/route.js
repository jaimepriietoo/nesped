import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { safeUpsertClientSettings } from "@/lib/client-settings";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { AjustesPortal } from "@/lib/server/esquemas-portal";

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
    if (sameOriginError) {
      return sameOriginError;
    }

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "settings.manage", ctx.permissions)) {
      return Response.json(
        { success: false, message: "Sin permisos para actualizar ajustes" },
        { status: 403 }
      );
    }

    const limited = await requireRateLimitAsync(req, {
      namespace: "portal:settings",
      limit: 30,
      keyParts: [ctx.clientId, ctx.userEmail],
      includeIp: false,
    });
    if (limited) return limited;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(AjustesPortal, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const body = leido.datos;

    const clientPayload = cleanObject({
      brand_name: withValue(body.brand_name, (value) => String(value || "").trim()),
      brand_logo_url: withValue(body.brand_logo_url, (value) => String(value || "").trim()),
      primary_color: withValue(body.primary_color, (value) => String(value || "").trim()),
      secondary_color: withValue(body.secondary_color, (value) => String(value || "").trim()),
      industry: withValue(body.industry, (value) => String(value || "").trim()),
      webhook: withValue(body.webhook, (value) => String(value || "").trim()),
      tagline: withValue(body.tagline, (value) => String(value || "").trim()),
      logo_text: withValue(body.logo_text, (value) => String(value || "").trim()),
      accent: withValue(body.accent, (value) => String(value || "").trim()),
      accent_text: withValue(body.accent_text, (value) => String(value || "").trim()),
      button: withValue(body.button, (value) => String(value || "").trim()),
      badge: withValue(body.badge, (value) => String(value || "").trim()),
      updated_at: new Date().toISOString(),
    });

    const settingsPayload = cleanObject({
      client_id: ctx.clientId,
      weekly_report_email: withValue(body.weekly_report_email, (value) =>
        String(value || "").trim().toLowerCase()
      ),
      daily_report_email: withValue(body.daily_report_email, (value) =>
        String(value || "").trim().toLowerCase()
      ),
      realtime_refresh_seconds: withValue(body.realtime_refresh_seconds, (value) =>
        Math.max(10, Number(value || 15))
      ),
      default_deal_value: withValue(body.default_deal_value, (value) =>
        Math.max(0, Number(value || 0))
      ),
      monthly_target_leads: withValue(body.monthly_target_leads, (value) =>
        Math.max(0, Number(value || 0))
      ),
      monthly_target_conversion: withValue(body.monthly_target_conversion, (value) =>
        Math.max(0, Number(value || 0))
      ),
    });

    if (Object.keys(clientPayload).length > 1) {
      const { error } = await ctx.supabase
        .from("clients")
        .update(clientPayload)
        .eq("id", ctx.clientId);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (Object.keys(settingsPayload).length > 1) {
      const { error } = await safeUpsertClientSettings(
        ctx.supabase,
        settingsPayload,
        { onConflict: "client_id" }
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    const { error: auditError } = await ctx.datos.from("audit_logs").insert({
      entity_type: "settings",
      entity_id: ctx.clientId,
      action: "settings_updated",
      actor: ctx.userEmail,
      changes: {
        fields: Object.keys(body).sort(),
      },
    });
    if (auditError) throw new Error("No se pudo auditar el cambio de ajustes");

    return Response.json({
      success: true,
      message: "Ajustes actualizados correctamente",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "No se pudieron guardar los ajustes",
      },
      { status: 500 }
    );
  }
}

export const PATCH = observeRoute("api.portal.settings.update.patch", manejarPATCH);
