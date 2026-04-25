import { getPortalContext } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { buildRevenueOsData } from "@/lib/server/portal-phase-four";
import {
  getClientMessageExperimentSnapshot,
  getClientPaymentRows,
} from "@/lib/server/portal-phase-two";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes, leadsRes, usersRes, products, subscriptions, invoices] =
      await Promise.all([
        ctx.supabase
          .from("clients")
          .select("id,name,brand_name,plan,industry,custom_domain")
          .eq("id", ctx.clientId)
          .single(),
        ctx.supabase
          .from("client_settings")
          .select("*")
          .eq("client_id", ctx.clientId)
          .maybeSingle(),
        ctx.supabase
          .from("leads")
          .select("id,status,score,owner,updated_at,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(1200),
        ctx.supabase
          .from("portal_users")
          .select("id,full_name,email,role,is_active")
          .eq("client_id", ctx.clientId),
        prisma.product.findMany({
          where: { active: true },
          orderBy: { price: "asc" },
        }),
        prisma.subscription.findMany({
          where: { client_id: ctx.clientId },
          orderBy: { created_at: "desc" },
          take: 12,
        }),
        prisma.invoice.findMany({
          where: { client_id: ctx.clientId },
          orderBy: { created_at: "desc" },
          take: 24,
        }),
      ]);

    const errors = [clientRes.error, settingsRes.error, leadsRes.error, usersRes.error].filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Revenue OS");
    }

    const leads = leadsRes.data || [];
    const payments = await getClientPaymentRows(ctx.clientId, 1000);
    const experiments = await getClientMessageExperimentSnapshot({
      leadIds: leads.map((lead) => lead.id).filter(Boolean),
    });

    return Response.json({
      success: true,
      data: buildRevenueOsData({
        client: clientRes.data || {},
        settings: settingsRes.data || {},
        leads,
        payments,
        products,
        users: usersRes.data || [],
        subscriptions,
        invoices,
        experiments,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Revenue OS",
      },
      { status: 500 }
    );
  }
}
