import { prisma } from "@/lib/prisma";
 
export async function GET() {
  try {
    const all = await prisma.appointment.findMany({ orderBy: { created_at: "desc" } });
    const booked = all.filter(a => a.status === "booked").length;
    const completed = all.filter(a => a.status === "completed").length;
    const cancelled = all.filter(a => a.status === "cancelled").length;
    const now = Date.now();
    const upcoming = all.filter(a => a.status === "booked" && new Date(a.start_at).getTime() > now).length;
 
    return Response.json({ success: true, data: { total: all.length, booked, completed, cancelled, upcoming } });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}