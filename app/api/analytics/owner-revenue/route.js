import { getSupabase } from "@/lib/supabase";
import { getPaidLeadRows, groupPaidLeadRows } from "@/lib/server/payments";
 
export async function GET() {
  try {
    const supabase = getSupabase();
    const rows = await getPaidLeadRows(1000);
    const grouped = groupPaidLeadRows(rows);
 
    // Enrich with lead owner from Supabase
    const leadIds = grouped.map(r => r.lead_id).filter(Boolean);
    let ownerMap = {};
    if (leadIds.length > 0) {
      const { data: leads } = await supabase.from("leads").select("id, owner").in("id", leadIds);
      (leads || []).forEach(l => { ownerMap[l.id] = l.owner || "Sin asignar"; });
    }
 
    // Group by owner
    const byOwner = new Map();
    for (const row of grouped) {
      const owner = ownerMap[row.lead_id] || row.customer_name || "Sin asignar";
      if (!byOwner.has(owner)) byOwner.set(owner, { owner, revenue: 0, paid_leads: 0, payments_count: 0, last_payment_at: null });
      const cur = byOwner.get(owner);
      cur.revenue += row.total_revenue;
      cur.paid_leads += 1;
      cur.payments_count += row.payments_count;
      if (!cur.last_payment_at || new Date(row.last_payment_at) > new Date(cur.last_payment_at)) cur.last_payment_at = row.last_payment_at;
    }
 
    const ranking = Array.from(byOwner.values())
      .map(r => ({ ...r, avg_ticket: r.paid_leads > 0 ? r.revenue / r.paid_leads : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
 
    const totalRevenue = ranking.reduce((s, r) => s + r.revenue, 0);
    const totalOwners = ranking.length;
    const bestOwner = ranking[0] || null;
 
    return Response.json({ success: true, data: { totalRevenue, totalOwners, bestOwner, ranking } });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}