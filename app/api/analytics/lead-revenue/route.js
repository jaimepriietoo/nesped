import { getPortalContext } from "@/lib/portal-auth";
import { groupPaidLeadRows } from "@/lib/server/payments";
import { getClientPaymentRows } from "@/lib/server/portal-phase-two";
 
export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const rows = await getClientPaymentRows(ctx.clientId, 1000);
    const grouped = groupPaidLeadRows(rows);
    const totalRevenue = grouped.reduce((s, r) => s + r.total_revenue, 0);
    const totalPaidLeads = grouped.length;
 
    return Response.json({
      success: true,
      data: { totalPaidLeads, totalRevenue, topLeads: grouped.slice(0, 50) },
    });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
