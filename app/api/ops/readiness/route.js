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
import { estadoDeProveedores } from "@/lib/server/cortacircuitos";

async function handleGet(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;
  const envReport = buildEnvReadinessReport();

  /* Qué proveedores externos están marcados como caídos. Es lo primero que
     hay que mirar cuando algo no sale: si el circuito de Resend está abierto,
     los informes no es que fallen, es que no se están ni intentando. */
  const proveedores = await estadoDeProveedores();

  return Response.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      env: envReport,
      proveedores,
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
