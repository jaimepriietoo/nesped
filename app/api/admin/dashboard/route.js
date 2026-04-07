import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data: calls, error } = await supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    const totalCalls = calls?.length || 0;
    const totalLeads = (calls || []).filter((c) => c.lead_captured).length;
    const avgDuration =
      totalCalls > 0
        ? Math.round(
            (calls || []).reduce(
              (acc, call) => acc + (call.duration_seconds || 0),
              0
            ) / totalCalls
          )
        : 0;

    const conversionRate =
      totalCalls > 0 ? Number(((totalLeads / totalCalls) * 100).toFixed(1)) : 0;

    const recentCalls = (calls || []).slice(0, 10).map((call) => ({
      id: call.id,
      created_at: call.created_at,
      status: call.status,
      summary: call.summary,
      lead_captured: call.lead_captured,
      duration_seconds: call.duration_seconds,
    }));

    return Response.json({
      success: true,
      metrics: {
        totalCalls,
        totalLeads,
        conversionRate,
        avgDuration,
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