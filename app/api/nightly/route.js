import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function buildInsights(calls, leads) {
  const items = [];
  const totalCalls = calls.length;
  const totalLeads = leads.length;
  const conversion = totalCalls > 0 ? ((totalLeads / totalCalls) * 100).toFixed(1) : "0.0";

  items.push({
    insight_type: "conversion",
    title: "Conversión diaria",
    body: `La conversión actual del periodo es ${conversion}%.`,
    priority: 10,
  });

  const hotLeads = leads.filter((l) => Number(l.score || 0) >= 80).length;
  items.push({
    insight_type: "quality",
    title: "Leads calientes",
    body: `Se han detectado ${hotLeads} leads con score alto.`,
    priority: 8,
  });

  const needs = {};
  leads.forEach((lead) => {
    const key = lead.necesidad || "sin definir";
    needs[key] = (needs[key] || 0) + 1;
  });

  const topNeed = Object.entries(needs).sort((a, b) => b[1] - a[1])[0];
  if (topNeed) {
    items.push({
      insight_type: "need",
      title: "Necesidad dominante",
      body: `La necesidad más repetida es "${topNeed[0]}".`,
      priority: 7,
    });
  }

  return items;
}

function buildAlerts(calls, leads) {
  const alerts = [];
  const hotLeads = leads.filter((l) => Number(l.score || 0) >= 80).length;
  const noLeadCalls = calls.filter((c) => !c.lead_captured).length;

  if (hotLeads > 0) {
    alerts.push({
      kind: "lead",
      severity: "high",
      title: "Lead caliente detectado",
      message: `Hay ${hotLeads} leads con score alto que conviene atender rápido.`,
    });
  }

  if (noLeadCalls > 3) {
    alerts.push({
      kind: "conversion",
      severity: "medium",
      title: "Varias llamadas sin lead",
      message: `Se han registrado ${noLeadCalls} llamadas sin lead capturado.`,
    });
  }

  return alerts;
}

export async function POST() {
  try {
    const supabase = getSupabase();
    const { data: clients, error } = await supabase.from("clients").select("*");

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    for (const client of clients || []) {
      const clientId = client.id;

      const [callsRes, leadsRes] = await Promise.all([
        supabase.from("calls").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(500),
        supabase.from("leads").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(500),
      ]);

      const calls = callsRes.data || [];
      const leads = leadsRes.data || [];

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

      const callsWithLead = calls.filter((c) => c.lead_captured).length;
      const callsWithoutLead = totalCalls - callsWithLead;

      await supabase.from("performance_snapshots").insert({
        client_id: clientId,
        period_type: "day",
        period_label: new Date().toISOString().slice(0, 10),
        total_calls: totalCalls,
        total_leads: totalLeads,
        conversion_rate: conversionRate,
        avg_duration_seconds: avgDuration,
        calls_with_lead: callsWithLead,
        calls_without_lead: callsWithoutLead,
      });

      const insights = buildInsights(calls, leads);
      for (const insight of insights) {
        await supabase.from("ai_insights").insert({
          client_id: clientId,
          ...insight,
        });
      }

      const alerts = buildAlerts(calls, leads);
      for (const alert of alerts) {
        await supabase.from("alerts").insert({
          client_id: clientId,
          ...alert,
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error en nightly job" },
      { status: 500 }
    );
  }
}