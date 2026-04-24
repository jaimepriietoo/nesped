import { buildEnvReadinessReport } from "@/lib/server/env.mjs";
import { getSessionSecurityProfile } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";
import { requirePortalRoleOrInternal } from "@/lib/server/security";

async function handleGet(req) {
  const access = await requirePortalRoleOrInternal(req, ["owner", "admin"]);
  if (!access.ok) {
    return access.response;
  }

  const envReport = buildEnvReadinessReport();

  return Response.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      env: envReport,
      session: getSessionSecurityProfile(),
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    },
  });
}

export const GET = observeRoute("api.ops.readiness.get", handleGet);
