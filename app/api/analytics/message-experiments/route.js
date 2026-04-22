import { prisma } from "@/lib/prisma";
 
export async function GET() {
  try {
    const variants = await prisma.messageVariant.findMany({ where: { active: true } });
    const results = await prisma.messageExperimentResult.findMany({ orderBy: { created_at: "desc" }, take: 500 });
 
    const enriched = variants.map(v => {
      const vResults = results.filter(r => r.variant_id === v.id);
      const sent = vResults.filter(r => r.event_type === "sent").length;
      const replied = vResults.filter(r => r.event_type === "reply").length;
      const converted = vResults.filter(r => r.event_type === "converted").length;
      return { ...v, sent, replied, converted, reply_rate: sent > 0 ? Math.round((replied / sent) * 100) : 0, conversion_rate: sent > 0 ? Math.round((converted / sent) * 100) : 0 };
    });
 
    return Response.json({ success: true, data: enriched });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}