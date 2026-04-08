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

    const [clientsRes, callsRes, leadsRes, usersRes] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("calls").select("*"),
      supabase.from("leads").select("*"),
      supabase.from("portal_users").select("*"),
    ]);

    if (clientsRes.error || callsRes.error || leadsRes.error || usersRes.error) {
      const message =
        clientsRes.error?.message ||
        callsRes.error?.message ||
        leadsRes.error?.message ||
        usersRes.error?.message ||
        "Error cargando super dashboard";

      return Response.json({ success: false, message }, { status: 500 });
    }

    const clients = clientsRes.data || [];
    const calls = callsRes.data || [];
    const leads = leadsRes.data || [];
    const users = usersRes.data || [];

    const byClient = clients.map((client) => {
      const clientCalls = calls.filter((c) => c.client_id === client.id);
      const clientLeads = leads.filter((l) => l.client_id === client.id);
      const clientUsers = users.filter((u) => u.client_id === client.id);

      return {
        client_id: client.id,
        client_name: client.name,
        total_calls: clientCalls.length,
        total_leads: clientLeads.length,
        conversion:
          clientCalls.length > 0
            ? Number(((clientLeads.length / clientCalls.length) * 100).toFixed(1))
            : 0,
        users: clientUsers.length,
      };
    });

    return Response.json({
      success: true,
      metrics: {
        totalClients: clients.length,
        totalCalls: calls.length,
        totalLeads: leads.length,
        totalUsers: users.length,
      },
      clients: byClient,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error cargando super dashboard" },
      { status: 500 }
    );
  }
}