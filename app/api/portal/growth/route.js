import { getPortalContext } from "@/lib/portal-auth";
import { buildGrowthWorkspace } from "@/lib/portal-product";
import { productos } from "@/lib/server/datos";
import {
  getClientMessageExperimentSnapshot,
  getClientPaymentRows,
} from "@/lib/server/portal-phase-two";
import { buildPortalServices } from "@/lib/server/portal-phase-three";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes, leadsRes, callsRes, products] =
      await Promise.all([
        ctx.supabase
          .from("clients")
          .select("id,name,brand_name,stripe_customer_id,custom_domain,webhook,twilio_number")
          .eq("id", ctx.clientId)
          .single(),
        ctx.supabase
          .from("client_settings")
          .select("*")
          .eq("client_id", ctx.clientId)
          .maybeSingle(),
        ctx.supabase
          .from("leads")
          .select(
            "id,nombre,status,score,owner,followup_sms_sent,next_action,next_step_ai,valor_estimado,created_at,updated_at"
          )
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(800),
        ctx.supabase
          .from("calls")
          .select("id,status,lead_captured,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(400),
        productos({ activos: true }),
      ]);

    const errors = [
      clientRes.error,
      settingsRes.error,
      leadsRes.error,
      callsRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Growth");
    }

    const leads = leadsRes.data || [];
    const payments = await getClientPaymentRows(ctx.clientId, 1000);
    const experiments = await getClientMessageExperimentSnapshot({
      clientId: ctx.clientId,
      leadIds: leads.map((lead) => lead.id).filter(Boolean),
    });
    const client = clientRes.data || {};
    const settings = settingsRes.data || {};

    return Response.json({
      success: true,
      data: buildGrowthWorkspace({
        client,
        settings,
        leads,
        calls: callsRes.data || [],
        payments,
        experiments,
        products,
        services: buildPortalServices(client, settings),
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "No se pudo cargar Growth",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.growth.get", manejarGET);
