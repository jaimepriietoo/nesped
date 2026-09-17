import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { persistElevenLabsCall } from "../../lib/server/elevenlabs.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/**
 * El webhook post-call de ElevenLabs no puede duplicar una llamada.
 *
 * Antes buscaba la llamada por (client_id, call_sid) y, si no estaba, la
 * insertaba. Dos entregas del mismo webhook a la vez —ElevenLabs reintenta,
 * y reintenta rápido— pasaban las dos la comprobación y metían dos filas:
 * dos llamadas, dos consumos, dos eventos en el contacto.
 *
 * Lo que esta prueba sujeta, con una base de datos simulada que apunta lo
 * que se le pide:
 *
 *   1. la llamada se escribe con upsert sobre (client_id, call_sid), que es
 *      lo que hace atómica la operación junto con el índice único;
 *   2. lo que viene después —eventos, consumo— se hace UNA vez por
 *      conversación: la segunda entrega ve reclamar_webhook() en false y no
 *      vuelve a anotar nada.
 */

/* Una base de datos de mentira: cada tabla devuelve lo que se le programe y
   apunta cada operación. Los métodos encadenables devuelven el propio
   constructor; al esperarlo, resuelve. */
function baseFalsa({ filas = {}, reclamar = true } = {}) {
  const apuntes = [];
  const constructor = (tabla) => {
    const b = {
      _tabla: tabla, _op: "select", _datos: null,
      select() { return b; }, eq() { return b; }, or() { return b; }, in() { return b; },
      order() { return b; }, limit() { return b; }, gte() { return b; }, lte() { return b; },
      not() { return b; }, is() { return b; },
      insert(d) { b._op = "insert"; b._datos = d; return b; },
      update(d) { b._op = "update"; b._datos = d; return b; },
      upsert(d, o) { b._op = "upsert"; b._datos = d; b._opciones = o; return b; },
      maybeSingle() { return b; }, single() { return b; },
      then(resolver) {
        apuntes.push({ tabla, op: b._op, datos: b._datos, opciones: b._opciones });
        const data = b._op === "select" ? (filas[tabla] ?? null) : (b._datos ?? null);
        return Promise.resolve({ data, error: null }).then(resolver);
      },
    };
    return b;
  };
  return {
    apuntes,
    from: constructor,
    async rpc(nombre, args) {
      apuntes.push({ rpc: nombre, args });
      if (nombre === "reclamar_webhook") return { data: reclamar, error: null };
      return { data: null, error: null };
    },
  };
}

const EMPRESA = { id: "demo", name: "Marca Demo", brand_name: "Marca Demo", twilio_number: "+34983460825" };

const PAYLOAD = {
  type: "post_call_transcription",
  data: {
    conversation_id: "conv_123",
    status: "done",
    transcript: [{ role: "user", message: "Hola, quería un presupuesto." }],
    metadata: { call_duration_secs: 42 },
    analysis: { transcript_summary: "Pide presupuesto." },
    conversation_initiation_client_data: {
      dynamic_variables: { client_id: "demo", caller_id: "+34600111222", called_number: "+34983460825" },
    },
  },
};

test("la llamada se guarda con upsert sobre (client_id, call_sid)", async () => {
  const bd = baseFalsa({ filas: { clients: EMPRESA, leads: [] }, reclamar: true });
  await persistElevenLabsCall({ supabase: bd, payload: PAYLOAD });

  const escrituras = bd.apuntes.filter((a) => a.tabla === "calls" && a.op !== "select");
  assert.equal(escrituras.length, 1, "una sola escritura en calls");
  assert.equal(escrituras[0].op, "upsert");
  assert.equal(escrituras[0].opciones?.onConflict, "client_id,call_sid");
  assert.equal(escrituras[0].datos.call_sid, "conv_123");
  assert.equal(escrituras[0].datos.client_id, "demo");
  assert.equal(bd.apuntes.some((a) => a.tabla === "calls" && a.op === "insert"), false, "ningún insert a pelo");
});

test("la segunda entrega del mismo webhook no vuelve a anotar consumo ni eventos", async () => {
  const primera = baseFalsa({ filas: { clients: EMPRESA, leads: [] }, reclamar: true });
  await persistElevenLabsCall({ supabase: primera, payload: PAYLOAD });
  const consumoPrimera = primera.apuntes.filter((a) => a.rpc === "anotar_consumo").length;
  assert.ok(consumoPrimera >= 1, "la primera entrega anota consumo");

  const segunda = baseFalsa({ filas: { clients: EMPRESA, leads: [] }, reclamar: false });
  const resultado = await persistElevenLabsCall({ supabase: segunda, payload: PAYLOAD });

  assert.equal(resultado.duplicated, true);
  /* La llamada sí se vuelve a escribir —es un upsert, no pasa nada— pero
     nada más: ni consumo, ni eventos, ni auditoría. */
  assert.equal(segunda.apuntes.filter((a) => a.tabla === "calls" && a.op === "upsert").length, 1);
  assert.equal(segunda.apuntes.filter((a) => a.rpc === "anotar_consumo").length, 0);
  assert.equal(segunda.apuntes.filter((a) => a.tabla === "lead_events" && a.op === "insert").length, 0);
  assert.equal(segunda.apuntes.filter((a) => a.tabla === "audit_logs" && a.op === "insert").length, 0);
});

test("sin identificador de conversación no se reclama nada y se procesa igual", async () => {
  const bd = baseFalsa({ filas: { clients: EMPRESA, leads: [] }, reclamar: false });
  const sinId = { ...PAYLOAD, data: { ...PAYLOAD.data, conversation_id: "" } };
  const resultado = await persistElevenLabsCall({ supabase: bd, payload: sinId });
  assert.notEqual(resultado.duplicated, true);
  assert.equal(bd.apuntes.some((a) => a.rpc === "reclamar_webhook"), false);
});

test("el webhook de inicio contesta con la forma que ElevenLabs espera y siempre contesta", () => {
  const s = fs.readFileSync(path.join(RAIZ, "app/api/voice/elevenlabs/context/route.js"), "utf8");
  assert.match(s, /type: "conversation_initiation_client_data"/);
  assert.match(s, /body\?\.caller_id/, "lee lo que manda ElevenLabs (snake_case)");
  assert.match(s, /nombre_empresa:/);
  assert.match(s, /contexto_empresa:/, "lleva la configuración de Tu IA a la llamada");
  assert.match(s, /requireInternalRequest\(req\)/);
  /* Y si el CRM falla, devuelve variables vacías en vez de un 500: mejor una
     llamada atendida a secas que un agente que no descuelga. */
  const catchBlock = s.slice(s.indexOf("} catch (error) {"));
  assert.match(catchBlock, /type: "conversation_initiation_client_data"/);
  assert.doesNotMatch(catchBlock, /status: 500/);
});
