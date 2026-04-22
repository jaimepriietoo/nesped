import { getPortalContext } from "@/lib/portal-auth";
 
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const { data, error } = await ctx.supabase
      .from("lead_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50);
 
    if (error) throw new Error(error.message);
    return Response.json({ success: true, data: data || [] });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}