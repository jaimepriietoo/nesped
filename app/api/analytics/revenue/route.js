import { getPaidLeadRows } from "@/lib/server/payments";
 
export async function GET() {
  try {
    const rows = await getPaidLeadRows(1000);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
 
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const today = rows.filter(r => new Date(r.created_at).getTime() >= todayStart).reduce((s, r) => s + r.amount, 0);
    const week = rows.filter(r => new Date(r.created_at).getTime() >= weekStart).reduce((s, r) => s + r.amount, 0);
    const count = rows.length;
    const avgTicket = count > 0 ? total / count : 0;
 
    return Response.json({ success: true, data: { total, today, week, count, avgTicket } });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}