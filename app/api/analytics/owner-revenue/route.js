import { getPortalContext } from "@/lib/portal-auth";
import {
  buildOwnerRevenueRanking,
  getClientPaymentRows,
} from "@/lib/server/portal-phase-two";
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

    const payments = await getClientPaymentRows(ctx.clientId, 1000);
    const leadIds = [...new Set(payments.map((row) => row.lead_id).filter(Boolean))];

    const [leadRes, userRes] = await Promise.all([
      leadIds.length > 0
        ? ctx.supabase
            .from("leads")
            .select("id,owner")
            .eq("client_id", ctx.clientId)
            .in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
      ctx.supabase
        .from("portal_users")
        .select("full_name,role")
        .eq("client_id", ctx.clientId),
    ]);

    const errors = [leadRes.error, userRes.error].filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar la clasificación");
    }

    const ranking = buildOwnerRevenueRanking({
      leads: leadRes.data || [],
      payments,
      users: userRes.data || [],
    });

    return Response.json({ success: true, data: ranking });
  } catch (err) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.analytics.owner-revenue.get", manejarGET);
