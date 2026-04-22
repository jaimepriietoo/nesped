import { prisma } from "@/lib/prisma";
import { getPortalContext } from "@/lib/portal-auth";
 
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    if (!leadId) return Response.json({ success: false, message: "Falta lead_id" }, { status: 400 });
 
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const memory = await prisma.leadMemory.findUnique({ where: { lead_id: leadId } });
    return Response.json({ success: true, data: memory || null });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
 
export async function POST(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const body = await req.json();
    const { lead_id, ...payload } = body;
    if (!lead_id) return Response.json({ success: false, message: "Falta lead_id" }, { status: 400 });
 
    const memory = await prisma.leadMemory.upsert({
      where: { lead_id },
      update: payload,
      create: { lead_id, ...payload },
    });
    return Response.json({ success: true, data: memory });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}