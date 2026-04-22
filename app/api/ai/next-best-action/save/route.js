import { getPortalContext } from "@/lib/portal-auth";
import { saveNextBestAction } from "@/lib/server/next-best-action-service";
import { isAuthorizedInternalRequest } from "@/lib/server/internal-api";
 
export async function POST(req) {
  try {
    // Allow internal requests (from automation)
    const isInternal = isAuthorizedInternalRequest(req);
    let supabase, clientId, leadId, brandName, useAI, actor;
 
    const body = await req.json();
    leadId = body.leadId;
    brandName = body.brandName || "nuestro equipo";
    useAI = body.useAI !== false;
 
    if (isInternal) {
      const { createAdminSupabase } = await import("@/lib/server/next-best-action-service");
      supabase = createAdminSupabase();
      clientId = body.clientId;
      actor = "system";
    } else {
      const ctx = await getPortalContext();
      if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
      supabase = ctx.supabase;
      clientId = body.clientId || ctx.clientId;
      actor = ctx.currentUser?.full_name || ctx.userEmail || "portal";
    }
 
    if (!leadId || !clientId) return Response.json({ success: false, message: "Faltan leadId o clientId" }, { status: 400 });
 
    const result = await saveNextBestAction({ supabase, leadId, clientId, brandName, useAI, actor });
    return Response.json({ success: true, data: result.lead, recommendation: result.recommendation });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}