import { getPortalContext } from "@/lib/portal-auth";
import {
  buildAdvancedAiInsights,
  buildProductPerformanceSnapshot,
} from "@/lib/portal-product";
import {
  buildOwnerRevenueRanking,
  getClientMessageExperimentSnapshot,
  getClientPaymentRows,
} from "@/lib/server/portal-phase-two";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes, leadsRes, callsRes, usersRes, products] =
      await Promise.all([
        ctx.supabase
          .from("clients")
          .select("id,name,brand_name,stripe_customer_id")
          .eq("id", ctx.clientId)
          .single(),
        ctx.supabase
          .from("client_settings")
          .select("*")
          .eq("client_id", ctx.clientId)
          .maybeSingle(),
        ctx.supabase
          .from("leads")
          .select("id,owner,status,score,predicted_close_probability")
          .eq("client_id", ctx.clientId)
          .limit(600),
        ctx.supabase
          .from("calls")
          .select("id,status,summary,summary_long,transcript,duration_seconds,result")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(120),
        ctx.supabase
          .from("portal_users")
          .select("full_name,role")
          .eq("client_id", ctx.clientId),
        prisma.product.findMany({
          where: { active: true },
          orderBy: { price: "asc" },
        }),
      ]);

    const errors = [
      clientRes.error,
      settingsRes.error,
      leadsRes.error,
      callsRes.error,
      usersRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudieron cargar insights");
    }

    const leads = leadsRes.data || [];
    const payments = await getClientPaymentRows(ctx.clientId, 1000);
    const experiments = await getClientMessageExperimentSnapshot({
      leadIds: leads.map((lead) => lead.id).filter(Boolean),
    });
    const productSnapshot = buildProductPerformanceSnapshot({
      products,
      payments,
    });
    const ownerRanking = buildOwnerRevenueRanking({
      leads,
      payments,
      users: usersRes.data || [],
    });

    const insights = buildAdvancedAiInsights({
      client: clientRes.data || {},
      settings: settingsRes.data || {},
      leads,
      calls: callsRes.data || [],
      payments,
      experiments,
      productPerformance: productSnapshot.rows,
      ownerRanking: ownerRanking.ranking,
    });

    return Response.json({
      success: true,
      data: {
        summary: {
          total: insights.length,
          highestPriority: insights[0]?.priority || 0,
          topCategory: insights[0]?.category || "general",
        },
        insights,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudieron cargar los insights avanzados",
      },
      { status: 500 }
    );
  }
}
