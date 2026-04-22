import { prisma } from "@/lib/prisma";
 
export async function GET() {
  try {
    const all = await prisma.leadReactivation.findMany({ orderBy: { sent_at: "desc" } });
    const now = Date.now();
    const last24h = all.filter(r => (now - new Date(r.sent_at).getTime()) < 24 * 60 * 60 * 1000).length;
    const byStage = all.reduce((acc, r) => { acc[r.stage] = (acc[r.stage] || 0) + 1; return acc; }, {});
 
    return Response.json({ success: true, data: { total: all.length, last24h, byStage } });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}