import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { requireSameOrigin } from "@/lib/server/security";

async function handlePost(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para probar webhooks"
    );
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager"])) {
      return Response.json(
        { success: false, message: "Sin permisos para probar webhooks" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const providedUrl = String(body?.url || "").trim();

    const { data: client, error } = await ctx.supabase
      .from("clients")
      .select("id,brand_name,name,webhook")
      .eq("id", ctx.clientId)
      .single();

    if (error || !client) {
      throw new Error(error?.message || "Cliente no encontrado");
    }

    const targetUrl = providedUrl || String(client.webhook || "").trim();
    if (!targetUrl) {
      return Response.json(
        { success: false, message: "No hay webhook configurado" },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const payload = {
      event: "nesped.webhook_test",
      created_at: new Date().toISOString(),
      client_id: ctx.clientId,
      client_name: client.brand_name || client.name || ctx.clientId,
      meta: {
        source: "portal_api_hub",
        actor: ctx.userEmail,
      },
      data: {
        ok: true,
        message: "Webhook test desde Nesped",
      },
    };

    let response;

    try {
      response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nesped-Event": payload.event,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text().catch(() => "");

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "webhook",
      entity_id: targetUrl,
      action: "webhook_test",
      actor: ctx.userEmail,
      changes: JSON.stringify({
        status: response.status,
        ok: response.ok,
      }),
      created_at: new Date().toISOString(),
    });

    logEvent("info", "portal.webhook_test_completed", {
      clientId: ctx.clientId,
      actor: ctx.userEmail,
      status: response.status,
      ok: response.ok,
    });

    return Response.json({
      success: response.ok,
      message: response.ok
        ? "Webhook respondió correctamente"
        : "El webhook respondió con error",
      data: {
        url: targetUrl,
        status: response.status,
        ok: response.ok,
        response: responseText.slice(0, 1200),
      },
    });
  } catch (error) {
    logEvent("error", "portal.webhook_test_failed", {
      error: {
        name: error?.name || "Error",
        message:
          error?.name === "AbortError"
            ? "Timeout al probar el webhook"
            : error?.message || "No se pudo probar el webhook",
      },
    });
    return Response.json(
      {
        success: false,
        message:
          error.name === "AbortError"
            ? "Timeout al probar el webhook"
            : error.message || "No se pudo probar el webhook",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute(
  "api.portal.webhook-test.post",
  handlePost
);
