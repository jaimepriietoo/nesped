import { logEvent, registerProcessHandlers } from "@/lib/server/observability.mjs";

export async function register() {
  registerProcessHandlers("next-app");
  logEvent("info", "app.instrumentation.ready", {
    service: "next-app",
    nodeEnv: process.env.NODE_ENV || "development",
  });
}
