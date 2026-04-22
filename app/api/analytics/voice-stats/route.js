import { prisma } from "@/lib/prisma";
 
export async function GET() {
  try {
    const calls = await prisma.voiceCall.findMany({ orderBy: { created_at: "desc" } });
    const now = Date.now();
    const today = calls.filter(c => (now - new Date(c.created_at).getTime()) < 24 * 60 * 60 * 1000).length;
    const useful = calls.filter(c => ["completed", "interested", "booked"].includes(String(c.result || "").toLowerCase())).length;
    const closedByVoice = calls.filter(c => ["booked", "converted", "qualified"].includes(String(c.result || "").toLowerCase())).length;
 
    return Response.json({ success: true, data: { total: calls.length, today, useful, closedByVoice } });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}