import { prisma } from "@/lib/prisma";
 
export async function GET() {
  try {
    const all = await prisma.upsellEvent.findMany({ orderBy: { created_at: "desc" } });
    const sent = all.filter(u => u.status === "sent").length;
    const converted = all.filter(u => u.status === "converted").length;
    const byTier = all.reduce((acc, u) => { const k = u.to_tier || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
 
    return Response.json({ success: true, data: { total: all.length, sent, converted, byTier } });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}