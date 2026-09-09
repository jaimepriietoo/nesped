import { getObservabilityStatus, logEvent, observeRoute } from "@/lib/server/observability.mjs";
import {
  captureServerException,
  flushServerSentry,
} from "@/lib/server/sentry.mjs";
import { requireInternalRequest } from "@/lib/server/internal-api";

async function handlePost(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;
  const actor = "internal";
  const error = new Error("Manual ops incident test");

  await captureServerException(error, {
    level: "error",
    tags: {
      kind: "manual",
      route: "api.ops.incident-test.post",
    },
    extra: {
      actor,
      triggeredAt: new Date().toISOString(),
    },
  });

  logEvent("error", "ops.incident_test.triggered", {
    actor,
    route: "api.ops.incident-test.post",
  });

  await flushServerSentry(2000);

  return Response.json({
    success: true,
    data: {
      message: "Incidente de prueba enviado a los canales configurados.",
      observability: getObservabilityStatus(),
    },
  });
}

export const POST = observeRoute("api.ops.incident-test.post", handlePost);
