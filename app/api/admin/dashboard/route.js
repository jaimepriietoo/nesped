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

    const [clientsRes, usersRes, callsRes, leadsRes] = await Promise.all([
      supabase.from("clients").select("id,plan,billing_status"),
      supabase.from("users").select("id"),
      supabase.from("calls").select("id,client_id,status,created_at"),
      supabase.from("leads").select("id,client_id,created_at"),
    ]);

    const clients = clientsRes.data || [];
    const users = usersRes.data || [];
    const calls = callsRes.data || [];
    const leads = leadsRes.data || [];

    const callsByClient = {};
    for (const call of calls) {
      callsByClient[call.client_id] = (callsByClient[call.client_id] || 0) + 1;
    }

    const leadsByClient = {};
    for (const lead of leads) {
      leadsByClient[lead.client_id] = (leadsByClient[lead.client_id] || 0) + 1;
    }

    return Response.json({
      success: true,
      data: {
        totals: {
          clients: clients.length,
          users: users.length,
          calls: calls.length,
          leads: leads.length,
        },
        callsByClient,
        leadsByClient,
        clients,
      },
    });
  } catch (error) {
    console.error("admin dashboard error:", error);
    return Response.json(
      { success: false, message: "Error cargando dashboard" },
      { status: 500 }
    );
  }
}