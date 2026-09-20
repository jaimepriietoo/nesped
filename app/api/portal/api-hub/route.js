import { getPortalContext } from "@/lib/portal-auth";
import { buildApiHubData } from "@/lib/server/portal-phase-three";
import { puede, sinPermiso } from "@/lib/server/permisos";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }
    if (!puede(ctx.role, "api.manage", ctx.permissions)) return sinPermiso();

    const [clientRes, settingsRes] = await Promise.all([
      ctx.supabase
        .from("clients")
        .select(
          "id,name,brand_name,custom_domain,webhook,twilio_number,stripe_customer_id,owner_email"
        )
        .eq("id", ctx.clientId)
        .single(),
      ctx.supabase
        .from("client_settings")
        .select("*")
        .eq("client_id", ctx.clientId)
        .maybeSingle(),
    ]);

    const errors = [clientRes.error, settingsRes.error].filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar API Hub");
    }

    const client = clientRes.data || {};
    let domainStatus = null;

    if (
      client?.custom_domain &&
      process.env.VERCEL_PROJECT_ID &&
      process.env.VERCEL_TOKEN
    ) {
      const inspectRes = await fetch(
        `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(
          client.custom_domain
        )}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          },
        }
      );

      domainStatus = await inspectRes.json().catch(() => null);
    }

    return Response.json({
      success: true,
      data: buildApiHubData({
        req,
        client,
        settings: settingsRes.data || {},
        domainStatus,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("portal.api_hub_failed", error);
    return Response.json(
      {
        success: false,
        message: "No se pudo cargar API Hub",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.api-hub.get", manejarGET);
