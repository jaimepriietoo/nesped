/* global __ENV, __VU, __ITER */
import http from "k6/http";
import crypto from "k6/crypto";
import { check, sleep } from "k6";
import { destino, umbrales, rampa } from "./comun.js";

/**
 * El post-call de ElevenLabs, firmado.
 *
 * Mide la bandeja de webhooks: verificar la firma, guardar el evento y
 * encolarlo. Tiene que ser barato y constante, porque es lo que el proveedor
 * espera que conteste en segundos. Cada iteración manda una conversación
 * distinta; repetir una es una fila que ya está y también se mide.
 *
 * Necesita el secreto del webhook DEL ENTORNO DE DESTINO:
 *   ELEVENLABS_WEBHOOK_SECRET, y CLIENT_ID de la empresa de prueba.
 * Las llamadas quedan en `calls` de esa empresa cuando la cola las procese:
 * datos sintéticos, en un entorno sintético.
 */
export const options = {
  ...rampa({ hasta: Number(__ENV.VUS || 10) }),
  thresholds: umbrales(500),
};

const BASE = destino();

function firmar(cuerpo, secreto) {
  const t = Math.floor(Date.now() / 1000);
  const v0 = crypto.hmac("sha256", secreto, `${t}.${cuerpo}`, "hex");
  return `t=${t},v0=${v0}`;
}

export default function escenario() {
  const secreto = __ENV.ELEVENLABS_WEBHOOK_SECRET;
  const clientId = __ENV.CLIENT_ID;
  if (!secreto || !clientId) throw new Error("Faltan ELEVENLABS_WEBHOOK_SECRET y CLIENT_ID del entorno de destino");

  const id = `carga_${__VU}_${__ITER}_${Date.now()}`;
  const cuerpo = JSON.stringify({
    type: "post_call_transcription",
    event_timestamp: Math.floor(Date.now() / 1000),
    data: {
      conversation_id: id,
      agent_id: "agente-de-carga",
      status: "done",
      transcript: [
        { role: "agent", message: "Hola, ¿en qué puedo ayudarle?" },
        { role: "user", message: "Quería pedir cita." },
      ],
      metadata: { call_duration_secs: 42, phone_call: { external_number: "+34600000000" } },
      conversation_initiation_client_data: { dynamic_variables: { client_id: clientId } },
      analysis: { transcript_summary: "Prueba de carga." },
    },
  });

  const r = http.post(`${BASE}/api/voice/elevenlabs/post-call`, cuerpo, {
    headers: { "Content-Type": "application/json", "ElevenLabs-Signature": firmar(cuerpo, secreto) },
  });
  check(r, { "post-call 200": (x) => x.status === 200 });
  sleep(0.2);
}
