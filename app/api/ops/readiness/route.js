import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";
import { buildEnvReadinessReport } from "@/lib/server/env.mjs";
import {
  getSessionSecurityProfile,
  getTwoFactorSecurityProfile,
} from "@/lib/server/auth";
import {
  getObservabilityStatus,
  observeRoute,
} from "@/lib/server/observability.mjs";
import { requireInternalRequest } from "@/lib/server/internal-api";

async function handleGet(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;
  const envReport = buildEnvReadinessReport();

  return Response.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      env: envReport,
      session: getSessionSecurityProfile(),
      twoFactor: getTwoFactorSecurityProfile(),
      observability: getObservabilityStatus(),
      voiceCompliance: getVoiceCompliancePolicy(),
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    },
  });
}

export const GET = observeRoute("api.ops.readiness.get", handleGet);
