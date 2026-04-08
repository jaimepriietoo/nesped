import { createClient } from "@supabase/supabase-js";
import { getResend } from "@/lib/resend";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST() {
  try {
    const supabase = getSupabase();
    const resend = getResend();

    const { data: clients, error } = await supabase
      .from("clients")
      .select("*");

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    for (const client of clients || []) {
      const clientId = client.id;

      const [
        settingsRes,
        callsRes,
        leadsRes,
      ] = await Promise.all([
        supabase.from("client_settings").select("*").eq("client_id", clientId).maybeSingle(),
        supabase.from("calls").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200),
        supabase.from("leads").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200),
      ]);

      const settings = settingsRes.data || null;
      const calls = callsRes.data || [];
      const leads = leadsRes.data || [];

      const to = settings?.weekly_report_email || client.owner_email;
      if (!to) continue;

      const totalCalls = calls.length;
      const totalLeads = leads.length;
      const conversionRate =
        totalCalls > 0 ? ((totalLeads / totalCalls) * 100).toFixed(1) : "0.0";

      const avgScore =
        totalLeads > 0
          ? Math.round(
              leads.reduce((acc, lead) => acc + Number(lead.score || 0), 0) / totalLeads
            )
          : 0;

      const topNeedMap = {};
      leads.forEach((lead) => {
        const k = lead.necesidad || "sin definir";
        topNeedMap[k] = (topNeedMap[k] || 0) + 1;
      });

      const topNeed = Object.entries(topNeedMap).sort((a, b) => b[1] - a[1])[0];

      const summary = `
        <div style="font-family:Arial;background:#0a0a0a;color:#fff;padding:32px;">
          <h1>Resumen semanal de ${client.brand_name || client.name || client.id}</h1>
          <p><strong>Llamadas:</strong> ${totalCalls}</p>
          <p><strong>Leads:</strong> ${totalLeads}</p>
          <p><strong>Conversión:</strong> ${conversionRate}%</p>
          <p><strong>Score medio:</strong> ${avgScore}</p>
          <p><strong>Necesidad más repetida:</strong> ${topNeed ? topNeed[0] : "Sin datos"}</p>
          <p style="margin-top:20px;">Entra en tu portal para ver más detalle.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/portal" style="background:#fff;color:#000;padding:12px 18px;border-radius:10px;text-decoration:none;">Abrir portal</a></p>
        </div>
      `;

      await resend.emails.send({
        from: "NESPED <reports@updates.nesped.com>",
        to: [to],
        subject: `Resumen semanal · ${client.brand_name || client.name || client.id}`,
        html: summary,
      });

      await supabase.from("weekly_reports").insert({
        client_id: clientId,
        week_start: new Date().toISOString().slice(0, 10),
        week_end: new Date().toISOString().slice(0, 10),
        total_calls: totalCalls,
        total_leads: totalLeads,
        conversion_rate: Number(conversionRate),
        avg_duration_seconds:
          totalCalls > 0
            ? Math.round(
                calls.reduce((acc, c) => acc + Number(c.duration_seconds || 0), 0) / totalCalls
              )
            : 0,
        summary: `Resumen semanal enviado a ${to}`,
        top_needs: topNeed ? [topNeed[0]] : [],
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error enviando resumen semanal" },
      { status: 500 }
    );
  }
}