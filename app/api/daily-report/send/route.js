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

    const { data: clients, error } = await supabase.from("clients").select("*");

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    for (const client of clients || []) {
      const clientId = client.id;

      const [settingsRes, callsRes, leadsRes] = await Promise.all([
        supabase.from("client_settings").select("*").eq("client_id", clientId).maybeSingle(),
        supabase.from("calls").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100),
        supabase.from("leads").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100),
      ]);

      const settings = settingsRes.data || null;
      const calls = callsRes.data || [];
      const leads = leadsRes.data || [];

      const to = settings?.daily_report_email || client.owner_email;
      if (!to) continue;

      const totalCalls = calls.length;
      const totalLeads = leads.length;
      const conversionRate =
        totalCalls > 0 ? ((totalLeads / totalCalls) * 100).toFixed(1) : "0.0";

      const html = `
        <div style="font-family:Arial;background:#0a0a0a;color:#fff;padding:32px;">
          <h1>Resumen diario · ${client.brand_name || client.name || client.id}</h1>
          <p><strong>Llamadas:</strong> ${totalCalls}</p>
          <p><strong>Leads:</strong> ${totalLeads}</p>
          <p><strong>Conversión:</strong> ${conversionRate}%</p>
          <p style="margin-top:20px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal" style="background:#fff;color:#000;padding:12px 18px;border-radius:10px;text-decoration:none;">Abrir portal</a>
          </p>
        </div>
      `;

      await resend.emails.send({
        from: "NESPED <reports@updates.nesped.com>",
        to: [to],
        subject: `Resumen diario · ${client.brand_name || client.name || client.id}`,
        html,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error enviando resumen diario" },
      { status: 500 }
    );
  }
}