import { getPortalContext } from "@/lib/portal-auth";
import { scoreVoiceCallQA } from "@/lib/portal-product";
import { prisma } from "@/lib/prisma";
import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function average(values = []) {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((acc, value) => acc + Number(value || 0), 0) / values.length
  );
}

function detectObjections(text = "") {
  const transcript = String(text || "").toLowerCase();
  const patterns = [
    ["precio", /(caro|precio|coste|cuesta|presupuesto)/],
    ["tiempo", /(ahora no|más tarde|sin tiempo|otro momento)/],
    ["confianza", /(no estoy seguro|dudas|confianza|me lo pienso)/],
    ["comparación", /(comparando|mirando otras opciones|otra empresa|otra opción)/],
  ];

  return patterns
    .filter(([, pattern]) => pattern.test(transcript))
    .map(([label]) => label);
}

function detectDisclosure(text = "") {
  return /(grab|graba|grabada|transcrip|transcrita|record)/i.test(
    String(text || "")
  );
}

function getNextStep(call = {}, qa = {}) {
  const result = String(call.result || call.status || "").toLowerCase();

  if (["qualified", "completed", "booked", "converted"].includes(result)) {
    return "Asignar owner y empujar cierre o cita en menos de 24h.";
  }

  if (qa.overall < 55) {
    return "Revisar llamada, ajustar guion y relanzar contacto con versión más corta.";
  }

  if (["busy", "no_answer", "failed"].includes(result)) {
    return "Activar fallback SMS/WhatsApp y programar retry inteligente.";
  }

  return "Mantener seguimiento ligero y dejar CTA único para la siguiente interacción.";
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

    const leadIds = uniqueLeadIds(leads);
    const memories =
      leadIds.length > 0
        ? await prisma.leadMemory.findMany({
            where: {
              lead_id: {
                in: leadIds,
              },
            },
          })
        : [];

    const memoryByLead = new Map(
      memories.map((memory) => [String(memory.lead_id || ""), memory])
    );

    const scoredCalls = (callsRes.data || []).map((call) => {
      const normalizedPhone =
        normalizePhone(call.to_number) || normalizePhone(call.from_number);
      const lead = phoneMap.get(normalizedPhone) || null;
      const qa = scoreVoiceCallQA(call);
      const transcript = call.transcript || "";
      const objections = detectObjections(
        `${call.summary || ""} ${call.summary_long || ""} ${transcript}`
      );
      const disclosureDetected = detectDisclosure(
        `${call.summary || ""} ${call.summary_long || ""} ${transcript}`
      );
      const memory = memoryByLead.get(String(lead?.id || "")) || null;
      const complianceScore = call.recording_url
        ? disclosureDetected
          ? 100
          : 52
        : 92;

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
        objections,
        compliance: {
          score: complianceScore,
          disclosureDetected,
          risk: complianceScore < 70 ? "warning" : "healthy",
        },
        nextStep: getNextStep(call, qa),
        memory,
        qa,
      };
    });

    const issueCounts = new Map();
    const objectionCounts = new Map();
    const ownerBuckets = new Map();

    scoredCalls.forEach((call) => {
      (call.qa?.issues || []).forEach((issue) => {
        issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
      });

      (call.objections || []).forEach((label) => {
        objectionCounts.set(label, (objectionCounts.get(label) || 0) + 1);
      });

      const owner = String(call.owner || "Sin owner");
      if (!ownerBuckets.has(owner)) {
        ownerBuckets.set(owner, {
          owner,
          calls: 0,
          scoreSum: 0,
          complianceSum: 0,
          wins: 0,
        });
      }

      const bucket = ownerBuckets.get(owner);
      bucket.calls += 1;
      bucket.scoreSum += Number(call.qa?.overall || 0);
      bucket.complianceSum += Number(call.compliance?.score || 0);
      if ((call.qa?.overall || 0) >= 75) bucket.wins += 1;
    });

    return Response.json({
      success: true,
      data: {
        compliance: getVoiceCompliancePolicy(),
        summary: {
          total: scoredCalls.length,
          withRecording: scoredCalls.filter((item) => item.recording_url).length,
          avgScore: average(scoredCalls.map((item) => item.qa?.overall || 0)),
          avgDuration: average(
            scoredCalls.map((item) => item.duration_seconds || 0)
          ),
          capturedLeads: scoredCalls.filter((item) => item.lead_captured).length,
          avgCompliance: average(
            scoredCalls.map((item) => item.compliance?.score || 0)
          ),
        },
        commonIssues: [...issueCounts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 5),
        commonObjections: [...objectionCounts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 6),
        ranking: [...ownerBuckets.values()]
          .map((item) => ({
            owner: item.owner,
            calls: item.calls,
            avgScore: item.calls > 0 ? Math.round(item.scoreSum / item.calls) : 0,
            avgCompliance:
              item.calls > 0 ? Math.round(item.complianceSum / item.calls) : 0,
            wins: item.wins,
          }))
          .sort((left, right) => right.avgScore - left.avgScore)
          .slice(0, 8),
        coach: [...ownerBuckets.values()]
          .map((item) => ({
            owner: item.owner,
            summary:
              item.calls > 0
                ? `${item.owner} promedia ${Math.round(
                    item.scoreSum / item.calls
                  )}/100 en QA con ${item.wins} llamadas destacadas.`
                : `${item.owner} todavía no tiene suficientes llamadas para coaching.`,
          }))
          .slice(0, 6),
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

function uniqueLeadIds(leads = []) {
  return [...new Set((leads || []).map((lead) => lead.id).filter(Boolean))];
}
