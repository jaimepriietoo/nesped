export async function register() {
  const runtime = process.env.NEXT_RUNTIME || "nodejs";
  const { ensureServerSentry } = await import("@/lib/server/sentry.mjs");
  const { logEvent, registerProcessHandlers } = await import(
    "@/lib/server/observability.mjs"
  );

  await ensureServerSentry(runtime);

  if (runtime !== "edge") {
    registerProcessHandlers("next-app");
  }

  logEvent("info", "app.instrumentation.ready", {
    service: "next-app",
    nodeEnv: process.env.NODE_ENV || "development",
    runtime,
  });
}

export async function onRequestError(error, request, context) {
  const { captureNextRequestError } = await import("@/lib/server/sentry.mjs");
  const { logEvent } = await import("@/lib/server/observability.mjs");

  await captureNextRequestError(error, request, context);

  logEvent("error", "app.request_error", {
    service: "next-app",
    routePath: context?.routePath || "",
    routeType: context?.routeType || "",
    requestPath: request?.path || "",
    requestMethod: request?.method || "",
    error: {
      name: error?.name || "Error",
      message: error?.message || "Unknown error",
      digest: error?.digest || "",
    },
  });
}
