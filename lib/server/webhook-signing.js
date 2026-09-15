import crypto from "node:crypto";
import { sessionSecret } from "@/lib/server/auth-crypto";

// Subclave por empresa y propósito; nunca se entrega la clave de sesión.
export function webhookKey(clientId) {
  if (!clientId) throw new Error("Falta empresa");
  return crypto.createHmac("sha256", sessionSecret()).update(`nesped:webhooks:v1:${clientId}`).digest("hex");
}

export function signWebhook(clientId, body, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto.createHmac("sha256", webhookKey(clientId)).update(`${timestamp}.${body}`).digest("hex");
  return { "X-Nesped-Signature": `t=${timestamp},v1=${signature}`, "X-Nesped-Version": "1" };
}
