import { consumeRateLimitAsync } from "@/lib/server/security";
import { exigirIAPermitida } from "@/lib/server/interruptores";

// Límites de operaciones, no una promesa de gasto en euros. Ante un fallo del
// contador se rechaza la generación. Los topes monetarios se fijan en OpenAI.
//
// Antes de contar, el interruptor: si la IA está en pausa —para la
// plataforma o para esta empresa— no se genera y no se consume cupo. Es el
// único sitio por el que pasa toda generación, así que es donde vive.
export async function reservarGeneracionIA(clientId) {
  if (!clientId) throw new Error("Falta empresa para generar");
  await exigirIAPermitida(clientId);
  for (const [namespace, keyParts, limit] of [
    ["ai:tenant:daily", [clientId], 100],
    ["ai:global:daily", [], 1000],
  ]) {
    const result = await consumeRateLimitAsync({ namespace, keyParts, limit, windowMs: 86400000 });
    if (!result.allowed) throw new Error("Límite de generación alcanzado");
  }
}
