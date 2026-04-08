import { getPortalContext } from "@/lib/portal-auth";

function predictCloseProbability(lead) {
  const score = Number(lead.score || 0);
  const status = String(lead.status || "new");

  let base = score;

  if (status === "contacted") base += 10;
  if (status === "qualified") base += 20;
  if (status === "won") base = 100;
  if (status === "lost") base = 0;

  if (base > 100) base = 100;
  if (base < 0) base = 0;

  return base;
}

function buildAutoInsights(calls = [], leads = []) {
  const insights = [];

  const totalCalls = calls.length;
  const totalLeads = leads.length;
  const conversion = totalCalls > 0 ? (totalLeads / totalCalls) * 100 : 0;

  insights.push({
    id: "auto-1",
    title: "Conversión actual",
    body: `La conversión actual del sistema es de ${conversion.toFixed(1)}%.`,
    insight_type: "conversion",
    priority: 10,
  });

  const byHour = {};
  calls.forEach((c) => {
    if (!c.created_at) return;
    const hour = new Date(c.created_at).getHours();
    byHour[hour] = (byHour[hour] || 0) + (c.lead_captured ? 1 : 0);
  });

  const bestHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
  if (bestHour) {
    insights.push({
      id: "auto-2",
      title: "Mejor franja horaria",
      body: `La franja de las ${bestHour[0]}:00 es una de las que más leads está generando.`,
      insight_type: "timing",
      priority: 8,
    });
  }

  const topNeedMap = {};
  leads.forEach((lead) => {
    const key = lead.necesidad || "sin definir";
    topNeedMap[key] = (topNeedMap[key] || 0) + 1;
  });

  const topNeed = Object.entries(topNeedMap).sort((a, b) => b[1] - a[1])[0];
  if (topNeed) {
    insights.push({
      id: "auto-3",
      title: "Necesidad más repetida",
      body: `La necesidad más detectada es: "${topNeed[0]}".`,
      insight_type: "need",
      priority: 7,
    });
  }

  return insights;
}

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    const [
      clientRes,
      settingsRes,
      usersRes,
      leadsRes,
      callsRes,
      alertsRes,
      insightsRes,
      benchmarkRes,
      auditRes,
    ] = await Promise.all([
      ctx.supabase.from("clients").select("*").eq("id", ctx.clientId).single(),
      ctx.supabase.from("client_settings").select("*").eq("client_id", ctx.clientId).maybeSingle(),
      ctx.supabase.from("portal_users").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: true }),
      ctx.supabase.from("leads").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false }),
      ctx.supabase.from("calls").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false }),
      ctx.supabase.from("alerts").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false }).limit(20),
      ctx.supabase.from("ai_insights").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false }).limit(20),
      ctx.supabase.from("performance_snapshots").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false }).limit(30),
      ctx.supabase.from("audit_logs").select("*").eq("client_id", ctx.clientId).order("created_at", { ascending: false }).limit(30),
    ]);

    if (clientRes.error) {
      return Response.json(
        { success: false, message: clientRes.error.message },
        { status: 500 }
      );
    }

    const client = clientRes.data || null;
    const settings = settingsRes.data || null;
    const users = usersRes.data || [];
    const leads = (leadsRes.data || []).map((lead) => ({
      ...lead,
      predicted_close_probability: predictCloseProbability(lead),
    }));
    const calls = callsRes.data || [];
    const alerts = alertsRes.data || [];
    const aiInsights = insightsRes.data || [];
    const benchmarks = benchmarkRes.data || [];
    const auditLogs = auditRes.data || [];

    const totalCalls = calls.length;
    const totalLeads = leads.length;
    const conversionRate =
      totalCalls > 0 ? Number(((totalLeads / totalCalls) * 100).toFixed(1)) : 0;

    const avgDuration =
      totalCalls > 0
        ? Math.round(
            calls.reduce((acc, c) => acc + Number(c.duration_seconds || 0), 0) / totalCalls
          )
        : 0;

    const avgLeadScore =
      totalLeads > 0
        ? Math.round(
            leads.reduce((acc, lead) => acc + Number(lead.score || 0), 0) / totalLeads
          )
        : 0;

    const hotLeads = leads.filter((l) => Number(l.score || 0) >= 80).length;

    const totalPotentialRevenue = leads.reduce(
      (acc, lead) => acc + Number(lead.valor_estimado || settings?.default_deal_value || 0),
      0
    );

    const byDay = {};
    const byHour = {};
    const byStatus = { new: 0, contacted: 0, qualified: 0, won: 0, lost: 0 };

    calls.forEach((call) => {
      if (!call.created_at) return;
      const d = new Date(call.created_at);
      const day = d.toLocaleDateString();
      const hour = `${d.getHours()}:00`;

      if (!byDay[day]) byDay[day] = { calls: 0, leads: 0 };
      byDay[day].calls += 1;
      if (call.lead_captured) byDay[day].leads += 1;

      if (!byHour[hour]) byHour[hour] = { calls: 0, leads: 0 };
      byHour[hour].calls += 1;
      if (call.lead_captured) byHour[hour].leads += 1;
    });

    leads.forEach((lead) => {
      const st = lead.status || "new";
      if (typeof byStatus[st] === "number") byStatus[st] += 1;
    });

    const bestDays = Object.entries(byDay)
      .map(([label, value]) => ({
        label,
        calls: value.calls,
        leads: value.leads,
        conversion: value.calls > 0 ? Number(((value.leads / value.calls) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 7);

    const bestHours = Object.entries(byHour)
      .map(([label, value]) => ({
        label,
        calls: value.calls,
        leads: value.leads,
        conversion: value.calls > 0 ? Number(((value.leads / value.calls) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 8);

    const mergedInsights = [...aiInsights, ...buildAutoInsights(calls, leads)];

    return Response.json({
      success: true,
      currentUser: ctx.currentUser,
      currentRole: ctx.role,
      client,
      settings,
      users,
      leads,
      calls,
      alerts,
      insights: mergedInsights,
      benchmarks,
      auditLogs,
      metrics: {
        totalCalls,
        totalLeads,
        conversionRate,
        avgDuration,
        avgLeadScore,
        hotLeads,
        totalPotentialRevenue,
      },
      rankings: {
        bestDays,
        bestHours,
      },
      pipeline: byStatus,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando overview" },
      { status: 500 }
    );
  }
}