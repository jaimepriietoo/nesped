import { consumeRateLimitAsync } from "@/lib/server/security";

// Límites de operaciones, no una promesa de gasto en euros. Ante un fallo del
// contador se rechaza la generación. Los topes monetarios se fijan en OpenAI.
export async function reservarGeneracionIA(clientId) {
  if (!clientId) throw new Error("Falta empresa para generar");
  for (const [namespace, keyParts, limit] of [
    ["ai:tenant:daily", [clientId], 100],
    ["ai:global:daily", [], 1000],
  ]) {
    const result = await consumeRateLimitAsync({ namespace, keyParts, limit, windowMs: 86400000 });
    if (!result.allowed) throw new Error("Límite de generación alcanzado");
  }
}
