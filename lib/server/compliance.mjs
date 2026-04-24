import { getSupabase } from "@/lib/supabase";

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export function getVoiceCompliancePolicy() {
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const policyUrl =
    process.env.VOICE_PRIVACY_URL ||
    (appUrl ? `${appUrl}/legal/voice-compliance` : "/legal/voice-compliance");
  const contactEmail = String(
    process.env.PRIVACY_CONTACT_EMAIL || "privacy@nesped.com"
  ).trim();

  return {
    noticeText:
      process.env.VOICE_LEGAL_NOTICE ||
      "Aviso: esta llamada puede ser atendida por un asistente de voz con IA y puede ser grabada y transcrita para calidad, seguridad, seguimiento comercial y mejora del servicio. Si prefieres no continuar en estas condiciones, indícalo y te ofreceremos una alternativa de contacto.",
    policyUrl,
    contactEmail,
    recordingRetentionDays: positiveInteger(
      process.env.RECORDING_RETENTION_DAYS,
      30
    ),
    transcriptRetentionDays: positiveInteger(
      process.env.TRANSCRIPT_RETENTION_DAYS,
      90
    ),
    responsibleModel:
      "El cliente que opera el flujo comercial decide el uso comercial de la conversación y Nesped actúa como plataforma tecnológica y proveedor de automatización, salvo que un contrato específico disponga otra distribución de responsabilidades.",
    purposes: [
      "gestionar conversaciones comerciales y soporte operativo",
      "mantener trazabilidad, seguridad y control de calidad",
      "entrenar y supervisar los flujos de voz asistidos por IA",
      "resolver incidencias, auditoría interna y mejora continua",
    ],
    rightsSummary:
      "La persona puede pedir una vía alternativa, oponerse a seguir en una llamada grabada, y solicitar revisión, limitación o supresión conforme al marco legal y contractual aplicable.",
    providerSummary:
      "La operación puede apoyarse en proveedores de telefonía, IA, mensajería, infraestructura y almacenamiento bajo controles de acceso, credenciales y retención limitados.",
  };
}

export function buildVoiceComplianceNotice() {
  const policy = getVoiceCompliancePolicy();
  return `${policy.noticeText} Puedes consultar más información en ${policy.policyUrl}`;
}

export async function runComplianceRetentionSweep() {
  const supabase = getSupabase();
  const policy = getVoiceCompliancePolicy();
  const now = Date.now();
  const recordingCutoff = new Date(
    now - policy.recordingRetentionDays * DAY_MS
  ).toISOString();
  const transcriptCutoff = new Date(
    now - policy.transcriptRetentionDays * DAY_MS
  ).toISOString();

  const summary = {
    recordingRetentionDays: policy.recordingRetentionDays,
    transcriptRetentionDays: policy.transcriptRetentionDays,
    recordingsRedacted: 0,
    transcriptsRedacted: 0,
  };

  const { data: recordingRows, error: recordingError } = await supabase
    .from("calls")
    .select("id")
    .lt("created_at", recordingCutoff)
    .not("recording_url", "is", null)
    .limit(500);

  if (recordingError) {
    throw new Error(recordingError.message || "No se pudieron revisar grabaciones");
  }

  if ((recordingRows || []).length > 0) {
    const { error } = await supabase
      .from("calls")
      .update({ recording_url: null })
      .in(
        "id",
        recordingRows.map((item) => item.id)
      );

    if (error) {
      throw new Error(error.message || "No se pudieron limpiar grabaciones");
    }

    summary.recordingsRedacted = recordingRows.length;
  }

  const { data: transcriptRows, error: transcriptError } = await supabase
    .from("calls")
    .select("id")
    .lt("created_at", transcriptCutoff)
    .not("transcript", "is", null)
    .limit(500);

  if (transcriptError) {
    throw new Error(transcriptError.message || "No se pudieron revisar transcripciones");
  }

  if ((transcriptRows || []).length > 0) {
    const { error } = await supabase
      .from("calls")
      .update({ transcript: null })
      .in(
        "id",
        transcriptRows.map((item) => item.id)
      );

    if (error) {
      throw new Error(error.message || "No se pudieron limpiar transcripciones");
    }

    summary.transcriptsRedacted = transcriptRows.length;
  }

  return summary;
}
