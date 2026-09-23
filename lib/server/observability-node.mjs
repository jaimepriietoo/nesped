import { captureServerException } from "@/lib/server/sentry.mjs";
import { logErrorSeguro, logEvent } from "@/lib/server/observability.mjs";

let processHandlersRegistered = false;

/**
 * Los eventos globales del proceso sólo existen en Node. Mantenerlos en un
 * módulo separado evita que Next los compile dentro de instrumentation Edge.
 */
export function registerProcessHandlers(service = "next-app") {
  if (processHandlersRegistered) return;

  processHandlersRegistered = true;

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    void captureServerException(error, {
      level: "error",
      tags: {
        kind: "process",
        signal: "unhandledRejection",
        service,
      },
    });
    logErrorSeguro("process.unhandled_rejection", error, { service });
  });

  process.on("uncaughtException", (error) => {
    void captureServerException(error, {
      level: "fatal",
      tags: {
        kind: "process",
        signal: "uncaughtException",
        service,
      },
    });
    logErrorSeguro("process.uncaught_exception", error, { service });
  });

  logEvent("info", "process.handlers_registered", { service });
}
