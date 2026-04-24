import { getPortalContext } from "@/lib/portal-auth";
 
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    const phone = searchParams.get("phone");
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });

    if (!leadId && !phone) {
      return Response.json(
        { success: false, message: "Falta lead_id o phone" },
        { status: 400 }
      );
    }

    const queries = [];

    if (leadId) {
      queries.push(
        ctx.supabase
          .from("lead_events")
          .select("*")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(80)
      );
    }

    if (phone) {
      queries.push(
        ctx.supabase
          .from("lead_events")
          .select("*")
          .eq("phone", phone)
          .order("created_at", { ascending: false })
          .limit(80)
      );
    }

    const results = await Promise.all(queries);
    const error = results.find((item) => item.error)?.error;
    if (error) throw new Error(error.message);

    const seenIds = new Set();
    const events = [];

    results.forEach((result) => {
      (result.data || []).forEach((item) => {
        const key =
          item?.id ||
          `${item?.lead_id || "no-lead"}:${item?.phone || "no-phone"}:${item?.type || "event"}:${item?.created_at || ""}`;
        if (seenIds.has(key)) return;
        seenIds.add(key);
        events.push(item);
      });
    });

    events.sort(
      (left, right) =>
        new Date(right.created_at || 0).getTime() -
        new Date(left.created_at || 0).getTime()
    );

    return Response.json({ success: true, data: events.slice(0, 80) });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
