export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { logEvent, registerProcessHandlers } = await import(
    "@/lib/server/observability.mjs"
  );

  registerProcessHandlers("next-app");
  logEvent("info", "app.instrumentation.ready", {
    service: "next-app",
    nodeEnv: process.env.NODE_ENV || "development",
  });
}
