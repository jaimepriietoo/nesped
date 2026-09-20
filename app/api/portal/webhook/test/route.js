import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { leerJsonLimitado, requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { comprobarUrlExterna, peticionExternaSegura } from "@/lib/server/url-segura";
import { signWebhook } from "@/lib/server/webhook-signing";
import { validar } from "@/lib/server/esquemas";
import { ProbarWebhook } from "@/lib/server/esquemas-portal";

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

    if (!puede(ctx.role, "api.test", ctx.permissions)) {
      return Response.json(
        { success: false, message: "Sin permisos para probar webhooks" },
        { status: 403 }
      );
    }

    const limited = await requireRateLimitAsync(req, { namespace: "webhook:test", limit: 10, keyParts: [ctx.clientId], includeIp: false });
    if (limited) return limited;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(ProbarWebhook, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const providedUrl = leido.datos.url;

    const { data: client, error } = await ctx.supabase
      .from("clients")
      .select("id,brand_name,name,webhook")
      .eq("id", ctx.clientId)
      .single();

    if (error || !client) {
      throw new Error(error?.message || "Cliente no encontrado");
    }

    const targetUrl = providedUrl || String(client.webhook || "").trim();

    /* La dirección la elige quien llama, y esta petición sale desde nuestro
       servidor: sin comprobarla, apuntando a localhost o a 169.254.169.254 se
       leían endpoints internos y metadatos del proveedor, porque abajo se
       devuelven 1.200 caracteres de la respuesta.

       Se comprueba también la del cliente guardada en la base de datos, no
       sólo la que llega en la petición: pudo guardarse antes de que esto
       existiera. */
    if (targetUrl) {
      const revision = await comprobarUrlExterna(targetUrl);
      if (!revision.ok) {
        return Response.json({ success: false, message: revision.motivo }, { status: 400 });
      }
    }

    if (!targetUrl) {
      return Response.json(
        { success: false, message: "No hay webhook configurado" },
        { status: 400 }
      );
    }

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

    const serialized = JSON.stringify(payload);
    const response = await peticionExternaSegura(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nesped-Event": payload.event,
          ...signWebhook(ctx.clientId, serialized),
        },
        body: serialized,
      });

    const responseText = await response.text().catch(() => "");

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "webhook",
      entity_id: new URL(targetUrl).origin,
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
        url: new URL(targetUrl).origin,
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
        message: "No se pudo probar el webhook. Revisa que sea HTTPS, público y que responda sin redirigir.",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute(
  "api.portal.webhook-test.post",
  handlePost
);
