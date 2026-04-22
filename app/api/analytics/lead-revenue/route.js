import { getPaidLeadRows, groupPaidLeadRows } from "@/lib/server/payments";
 
export async function GET() {
  try {
    const rows = await getPaidLeadRows(1000);
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