import { getPortalContext } from "@/lib/portal-auth";
import { scoreVoiceCallQA } from "@/lib/portal-product";

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function average(values = []) {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((acc, value) => acc + Number(value || 0), 0) / values.length
  );
}

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [leadsRes, callsRes] = await Promise.all([
      ctx.supabase
        .from("leads")
        .select("id,nombre,telefono,owner,status,score")
        .eq("client_id", ctx.clientId)
        .limit(500),
      ctx.supabase
        .from("calls")
        .select(
          "id,call_sid,from_number,to_number,status,summary,summary_long,transcript,recording_url,duration_seconds,lead_captured,detected_intent,created_at"
        )
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    const errors = [leadsRes.error, callsRes.error].filter(Boolean);
    if (errors.length > 0) {
      throw new Error(
        errors[0].message || "No se pudieron cargar llamadas del centro de voz"
      );
    }

    const phoneMap = new Map();
    const leads = leadsRes.data || [];

    leads.forEach((lead) => {
      const normalized = normalizePhone(lead.telefono);
      if (normalized) {
        phoneMap.set(normalized, lead);
      }
    });

    const scoredCalls = (callsRes.data || []).map((call) => {
      const normalizedPhone =
        normalizePhone(call.to_number) || normalizePhone(call.from_number);
      const lead = phoneMap.get(normalizedPhone) || null;
      const qa = scoreVoiceCallQA(call);

      return {
        id: call.id,
        callSid: call.call_sid || "",
        created_at: call.created_at,
        leadId: lead?.id || null,
        leadName: lead?.nombre || "Lead sin identificar",
        owner: lead?.owner || "",
        phone: lead?.telefono || call.to_number || call.from_number || "",
        score: lead?.score || 0,
        status: call.status || "unknown",
        summary: call.summary || call.summary_long || "",
        transcript: call.transcript || "",
        recording_url: call.recording_url || "",
        duration_seconds: Number(call.duration_seconds || 0),
        lead_captured: Boolean(call.lead_captured),
        detected_intent: call.detected_intent || "",
        qa,
      };
    });

    const issueCounts = new Map();
    scoredCalls.forEach((call) => {
      (call.qa?.issues || []).forEach((issue) => {
        issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
      });
    });

    return Response.json({
      success: true,
      data: {
        summary: {
          total: scoredCalls.length,
          withRecording: scoredCalls.filter((item) => item.recording_url).length,
          avgScore: average(scoredCalls.map((item) => item.qa?.overall || 0)),
          avgDuration: average(
            scoredCalls.map((item) => item.duration_seconds || 0)
          ),
          capturedLeads: scoredCalls.filter((item) => item.lead_captured).length,
        },
        commonIssues: [...issueCounts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 5),
        calls: scoredCalls,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar el centro de voz",
      },
      { status: 500 }
    );
  }
}
