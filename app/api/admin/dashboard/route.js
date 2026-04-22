import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();

    const [{ data: calls, error: callsError }, { data: leads, error: leadsError }] =
      await Promise.all([
        supabase.from("calls").select("*").order("created_at", { ascending: false }),
        supabase.from("leads").select("*").order("created_at", { ascending: false }),
      ]);

    if (callsError) {
      return Response.json(
        { success: false, message: callsError.message },
        { status: 500 }
      );
    }

    if (leadsError) {
      return Response.json(
        { success: false, message: leadsError.message },
        { status: 500 }
      );
    }

    const totalCalls = calls?.length || 0;
    const totalLeads = leads?.length || 0;

    const avgDuration =
      totalCalls > 0
        ? Math.round(
            (calls || []).reduce(
              (acc, call) => acc + Number(call.duration_seconds || 0),
              0
            ) / totalCalls
          )
        : 0;

    const conversionRate =
      totalCalls > 0 ? Number(((totalLeads / totalCalls) * 100).toFixed(1)) : 0;

    const avgLeadScore =
      totalLeads > 0
        ? Math.round(
            (leads || []).reduce((acc, lead) => acc + Number(lead.score || 0), 0) /
              totalLeads
          )
        : 0;

    const hotLeads = (leads || []).filter((l) => Number(l.score || 0) >= 80).length;

    const recentCalls = (calls || []).slice(0, 12).map((call) => ({
      id: call.id,
      created_at: call.created_at,
      status: call.status,
      summary: call.summary,
      summary_long: call.summary_long,
      lead_captured: call.lead_captured,
      duration_seconds: call.duration_seconds,
      transcript: call.transcript,
      call_outcome: call.call_outcome,
      detected_intent: call.detected_intent,
    }));

    return Response.json({
      success: true,
      metrics: {
        totalCalls,
        totalLeads,
        conversionRate,
        avgDuration,
        avgLeadScore,
        hotLeads,
      },
      recentCalls,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando dashboard" },
      { status: 500 }
    );
  }
}
