import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPARTAMENTOS_POR_DEFECTO, clasificarPorPalabras, textoDelLead, clasificarLead } from "@/lib/server/departamentos";
import { seleccionarDestinatarios, correoDeLead, notificarLead, correoDesactivado } from "@/lib/server/destinatarios";
import { estadoDeLaIA } from "@/lib/server/estado-ia";

/**
 * Clasificar por departamento y avisar a quien toca.
 *
 * Lo que se sujeta: que sin IA se clasifica por palabras y se dice que fue
 * así (nunca con cara de IA); que la selección de destinatarios sigue las
 * reglas —departamento, copia de todo, dirección si es importante— sin
 * repetir a nadie ni contar con los inactivos; y que en pruebas no sale un
 * solo correo.
 */

const DEPS = DEPARTAMENTOS_POR_DEFECTO;

test("los departamentos de serie son los once del encargo y acaban en 'otro'", () => {
  assert.equal(DEPS.length, 11);
  assert.deepEqual(DEPS.map((d) => d.clave), ["ventas", "soporte", "administracion", "facturacion", "direccion", "instalaciones", "atencion", "marketing", "rrhh", "tecnico", "otro"]);
  for (const d of DEPS) assert.ok(d.descripcion, `${d.clave} necesita descripción: es lo que lee la IA`);
});

test("por palabras clave: acierta lo evidente, 'otro' si nada encaja, y saca señales", () => {
  const r = clasificarPorPalabras("Hola, quería un presupuesto para instalar fibra, es urgente", DEPS);
  assert.equal(r.fuente, "palabras");
  assert.ok(["ventas", "instalaciones"].includes(r.departamento));
  assert.equal(r.senales.urgente, true);
  assert.equal(r.senales.oportunidad, true);
  assert.match(r.motivo, /Palabras clave/);

  const f = clasificarPorPalabras("Me han cobrado dos veces la factura de agosto", DEPS);
  assert.equal(f.departamento, "facturacion");

  const nada = clasificarPorPalabras("zzz", DEPS);
  assert.equal(nada.departamento, "otro");
  assert.ok(nada.confianza < 0.5);
});

test("el texto que se analiza junta lo que se sabe del contacto y nada más", () => {
  assert.equal(textoDelLead({ necesidad: "fibra", resumen: "pide precio", notes: "" }, ["extra"]), "fibra\npide precio\nextra");
  assert.equal(textoDelLead({}), "");
});

function baseFalsa(filas = {}) {
  const apuntes = [];
  const from = (tabla) => {
    const b = { _op: "select", _datos: null,
      select() { return b; }, eq() { return b; }, gte() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; },
      insert(d) { b._op = "insert"; b._datos = d; return b; }, update(d) { b._op = "update"; b._datos = d; return b; },
      maybeSingle() { return b; }, single() { return b; },
      then(r) { apuntes.push({ tabla, op: b._op, datos: b._datos }); const data = b._op === "select" ? (filas[tabla] ?? null) : b._datos; return Promise.resolve({ data, error: null }).then(r); },
    };
    return b;
  };
  return { apuntes, from, rpc: async () => ({ data: null, error: null }) };
}

test("sin clave de OpenAI la IA está apagada con motivo, y clasificar cae a palabras clave diciéndolo", async () => {
  const estado = await estadoDeLaIA(null, { env: { NODE_ENV: "test" } });
  assert.equal(estado.activa, false);
  assert.match(estado.motivo, /OPENAI_API_KEY/);
  assert.ok(Object.values(estado.funciones).every((f) => f.activa === false && f.sinIA));

  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const base = baseFalsa({ leads: { id: "l1", client_id: "acme", necesidad: "no funciona el router, sin servicio desde ayer" }, departamentos: [], clients: { brand_name: "Acme" } });
    const r = await clasificarLead({ clientId: "acme", leadId: "l1", supabase: base });
    assert.equal(r.fuente, "palabras");
    assert.equal(r.departamento, "soporte");
    const guardado = base.apuntes.find((a) => a.tabla === "leads" && a.op === "update");
    assert.equal(guardado.datos.departamento, "soporte");
    assert.match(guardado.datos.departamento_motivo, /por palabras clave/, "queda escrito que no fue la IA");
    assert.equal(guardado.datos.senales.fuente, "palabras");
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});

const PERSONAS = [
  { id: "1", nombre: "Ana", email: "ana@acme.es", departamentos: ["ventas"], recibe_todo: false, activo: true },
  { id: "2", nombre: "Bea", email: "bea@acme.es", departamentos: ["soporte", "tecnico"], recibe_todo: false, activo: true },
  { id: "3", nombre: "Carlos", email: "carlos@acme.es", departamentos: ["direccion"], recibe_todo: false, activo: true },
  { id: "4", nombre: "Dani", email: "dani@acme.es", departamentos: [], recibe_todo: true, activo: true },
  { id: "5", nombre: "Eva", email: "eva@acme.es", departamentos: ["ventas"], recibe_todo: true, activo: false },
  { id: "6", nombre: "Ana bis", email: "ANA@acme.es", departamentos: ["ventas"], recibe_todo: false, activo: true },
];

test("a quién se avisa: departamento, copia de todo, dirección si es importante; sin repetidos ni inactivos", () => {
  const ventas = seleccionarDestinatarios(PERSONAS, { departamento: "ventas" });
  assert.deepEqual(ventas.map((x) => x.destinatario.email), ["ana@acme.es", "dani@acme.es"], "Eva está inactiva y 'ANA@' es la misma Ana");
  assert.deepEqual(ventas.map((x) => x.motivo), ["departamento:ventas", "copia_de_todo"]);

  const importante = seleccionarDestinatarios(PERSONAS, { departamento: "soporte", importante: true });
  assert.deepEqual(importante.map((x) => x.destinatario.email), ["bea@acme.es", "dani@acme.es", "carlos@acme.es"]);

  const nadie = seleccionarDestinatarios(PERSONAS, { departamento: "marketing" });
  assert.deepEqual(nadie.map((x) => x.destinatario.email), ["dani@acme.es"], "sólo la copia de todo");
  assert.deepEqual(seleccionarDestinatarios([], { departamento: "ventas" }), []);
});

test("el correo lleva lo útil, escapa el HTML y marca lo urgente en el asunto", () => {
  const { asunto, html } = correoDeLead({ empresa: "Acme", lead: { nombre: "<b>Luis</b>", telefono: "600" }, clasificacion: { nombreDepartamento: "Ventas", motivo: "pide precio", senales: { urgente: true } }, destinatario: { nombre: "Ana" } });
  assert.match(asunto, /^\[URGENTE\] Nuevo contacto para Ventas/);
  assert.doesNotMatch(html, /<b>Luis/);
  assert.match(html, /&lt;b&gt;Luis/);
});

test("en pruebas no sale ningún correo: queda apuntado como omitido", async () => {
  assert.equal(correoDesactivado({ NODE_ENV: "test" }), true);
  assert.equal(correoDesactivado({ NODE_ENV: "production", RESEND_API_KEY: "x", NESPED_SIN_CORREO: "si" }), true);
  assert.equal(correoDesactivado({ NODE_ENV: "production", RESEND_API_KEY: "x" }), false);
  const base = baseFalsa({ destinatarios: PERSONAS, clients: { brand_name: "Acme" } });
  const r = await notificarLead({ clientId: "acme", lead: { id: "l1", nombre: "Luis" }, clasificacion: { departamento: "ventas", senales: {} }, supabase: base });
  assert.equal(r.enviados, 0);
  assert.equal(r.omitidos, 2);
  const apuntadas = base.apuntes.filter((a) => a.tabla === "notificaciones_lead" && a.op === "insert");
  assert.equal(apuntadas.length, 2);
  assert.ok(apuntadas.every((a) => a.datos.estado === "omitido"));
});

test("cada llamada entera va a quien recibe copia de todo, sin repetir a quien acaba de recibir el aviso del contacto", async () => {
  const { correoDeLlamada, notificarLlamada } = await import("@/lib/server/destinatarios");
  const { asunto, html } = correoDeLlamada({ empresa: "Fibergreen", llamada: { created_at: "2026-09-19T10:00:00Z", from_number: "+34600", duration_seconds: 42, status: "completed", summary: "Pide fibra", transcript: "Agente: hola\nUsuario: quiero fibra" }, lead: { nombre: "Luis", departamento: "ventas", tags: ["urgente"] }, destinatario: { nombre: "Central" }, urlPortal: "https://x/portal" });
  assert.match(asunto, /^Llamada en Fibergreen: Luis · 42 s$/);
  assert.match(html, /Transcripción/);
  assert.match(html, /quiero fibra/);
  assert.match(html, /urgente/);

  /* Con la fake: calls devuelve la llamada, destinatarios la central, leads
     el contacto y notificaciones_lead un aviso reciente a esa misma central. */
  const base = baseFalsa({
    calls: { id: "c1", call_sid: "conv_1", client_id: "acme", lead_id: "l1", from_number: "+34600", duration_seconds: 10 },
    destinatarios: [{ id: "d1", nombre: "Central", email: "central@acme.es", recibe_todo: true, activo: true }],
    leads: { id: "l1", nombre: "Luis" },
    notificaciones_lead: [{ email: "central@acme.es" }],
    clients: { brand_name: "Acme" },
  });
  const r = await notificarLlamada({ clientId: "acme", callSid: "conv_1", supabase: base });
  assert.equal(r.enviados, 0);
  assert.equal(r.omitidos, 1, "ya recibió el aviso del contacto hace nada: no se repite");

  const base2 = baseFalsa({
    calls: { id: "c1", call_sid: "conv_1", client_id: "acme", lead_id: null, from_number: "", duration_seconds: 10 },
    destinatarios: [{ id: "d1", nombre: "Central", email: "central@acme.es", recibe_todo: true, activo: true }],
    clients: { brand_name: "Acme" },
  });
  const r2 = await notificarLlamada({ clientId: "acme", callSid: "conv_1", supabase: base2 });
  assert.equal(r2.omitidos, 1, "en pruebas no sale correo: queda apuntado como omitido");
  assert.ok(base2.apuntes.some((a) => a.tabla === "notificaciones_lead" && a.op === "insert" && a.datos.motivo === "llamada:conv_1"));
});
