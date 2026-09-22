import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPARTAMENTOS_POR_DEFECTO, clasificarPorPalabras, textoDelLead, clasificarLead } from "@/lib/server/departamentos";
import {
  combinarDatosDeLlamada,
  seleccionarDestinatarios,
  correoDeLead,
  correoDeLlamada,
  notificarLead,
  correoDesactivado,
} from "@/lib/server/destinatarios";
import fs from "node:fs";
import path from "node:path";
import { estadoDeLaIA } from "@/lib/server/estado-ia";

const RAIZ = path.resolve(import.meta.dirname, "../..");

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

test("los departamentos de serie son tres, con sus áreas dentro", () => {
  assert.deepEqual(DEPS.map((d) => d.clave), ["ventas", "soporte", "administracion"]);
  assert.deepEqual(DEPS.find((d) => d.clave === "soporte").areas, ["Instalaciones"]);
  assert.deepEqual(DEPS.find((d) => d.clave === "administracion").areas, ["Facturación", "Dirección"]);
  for (const d of DEPS) assert.ok(d.descripcion, `${d.clave} necesita descripción: es lo que lee la IA`);
  assert.ok(!DEPS.some((d) => d.clave === "otro"), "lo que no encaja queda sin clasificar, no en 'otro'");
});

test("por palabras clave: acierta lo evidente, null si nada encaja, y saca señales", () => {
  const r = clasificarPorPalabras("Hola, quería un presupuesto para instalar fibra, es urgente", DEPS);
  assert.equal(r.fuente, "palabras");
  assert.ok(["ventas", "soporte"].includes(r.departamento));
  assert.equal(r.senales.urgente, true);
  assert.equal(r.senales.oportunidad, true);
  assert.match(r.motivo, /Palabras clave/);

  const f = clasificarPorPalabras("Me han cobrado dos veces la factura de agosto", DEPS);
  assert.equal(f.departamento, "administracion", "facturación es un área de administración");
  const i = clasificarPorPalabras("Cuándo viene el técnico a hacer la instalación", DEPS);
  assert.equal(i.departamento, "soporte", "instalaciones es un área de soporte");

  const nada = clasificarPorPalabras("zzz", DEPS);
  assert.equal(nada.departamento, null);
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
      select() { return b; }, eq() { return b; }, gte() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; }, filter() { return b; },
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

    const aislada = baseFalsa({
      leads: { id: "l2", client_id: "acme", necesidad: "factura antigua y cobro duplicado", resumen: "administración" },
      departamentos: [],
      clients: { brand_name: "Acme" },
    });
    const soloEstaLlamada = await clasificarLead({
      clientId: "acme",
      leadId: "l2",
      textoExtra: ["Quiero presupuesto para contratar fibra"],
      soloTextoExtra: true,
      supabase: aislada,
    });
    assert.equal(soloEstaLlamada.departamento, "ventas", "la llamada nueva no hereda la factura antigua");
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

test("cada llamada entera va a quien recibe copia de todo, sin repetir la misma conversación", async () => {
  const { correoDeLlamada, notificarLlamada } = await import("@/lib/server/destinatarios");
  const { asunto, html } = correoDeLlamada({ empresa: "Fibergreen", llamada: { created_at: "2026-09-19T10:00:00Z", from_number: "+34600", duration_seconds: 42, status: "completed", summary: "Pide fibra", transcript: "Agente: hola\nUsuario: quiero fibra" }, nombreConocido: "Luis antiguo", clasificacion: { departamento: "ventas", nombreDepartamento: "Ventas", motivo: "Pide fibra ahora" }, dicho: { nombre: "Luis", notas: "urgente" }, destinatario: { nombre: "Central", recibe_todo: true }, urlPortal: "https://x/portal" });
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
  assert.equal(r.omitidos, 1, "ya recibió el aviso de esta conversación: no se repite");

  const base2 = baseFalsa({
    calls: { id: "c1", call_sid: "conv_1", client_id: "acme", lead_id: null, from_number: "", duration_seconds: 10 },
    destinatarios: [{ id: "d1", nombre: "Central", email: "central@acme.es", recibe_todo: true, activo: true }],
    clients: { brand_name: "Acme" },
  });
  const r2 = await notificarLlamada({ clientId: "acme", callSid: "conv_1", supabase: base2 });
  assert.equal(r2.omitidos, 1, "en pruebas no sale correo: queda apuntado como omitido");
  assert.ok(base2.apuntes.some((a) => a.tabla === "notificaciones_lead" && a.op === "insert" && a.datos.motivo === "llamada:conv_1"));
});

test("el correo de la llamada lleva sólo lo dicho en esa llamada, no la ficha", () => {
  const llamada = { created_at: "2026-09-21T10:00:00Z", from_number: "+34600111222", duration_seconds: 61, status: "done", summary: "Pide cita de instalación." };
  const lead = { nombre: "Ana de la ficha", telefono: "+34600111222", email: "ana@x.com", ciudad: "Valladolid", necesidad: "lo de hace un mes", notes: "notas viejas", departamento: "soporte", departamento_motivo: "Instalaciones: pide cita." };
  const dicho = { nombre: "Ana", ciudad: "Valdestillas", necesidad: "instalar fibra en la casa nueva" };
  const { asunto, html } = correoDeLlamada({ empresa: "Fibergreen", llamada, lead, nombreConocido: lead.nombre, clasificacion: { departamento: "ventas", nombreDepartamento: "Ventas", motivo: "Por lo dicho ahora" }, dicho, destinatario: { nombre: "Jaime" }, urlPortal: "" });
  assert.match(asunto, /Ana · 61 s/);
  assert.match(html, /Valdestillas/);
  assert.match(html, /instalar fibra en la casa nueva/);
  assert.match(html, /Derivado a/);
  assert.doesNotMatch(html, /Ana de la ficha|ana@x\.com|lo de hace un mes|notas viejas|Valladolid/, "nada de la ficha");
  /* Sin datos de esta llamada, el correo sigue saliendo, sólo con la llamada. */
  const vacio = correoDeLlamada({ empresa: "Fibergreen", llamada, lead, nombreConocido: lead.nombre, destinatario: {}, urlPortal: "" });
  assert.match(vacio.asunto, /Ana de la ficha/, "el único dato antiguo permitido es el nombre");
  assert.doesNotMatch(vacio.html, /ana@x\.com|lo de hace un mes|notas viejas|Valladolid/);
});

test("los datos parciales de una conversación se unen sin aceptar campos de otra ficha", () => {
  assert.deepEqual(combinarDatosDeLlamada([
    { meta: { conversation_id: "c1", nombre: "Ana", email: "viejo@ejemplo.invalid", campo_inventado: "no" } },
    { meta: { conversation_id: "c1", email: "nuevo@ejemplo.invalid", necesidad: "alta nueva" } },
  ]), { nombre: "Ana", email: "nuevo@ejemplo.invalid", necesidad: "alta nueva" });
});

test("el agente empieza cada llamada de cero salvo el nombre: recibe el nombre, no el resto, y se le dice que repregunte", () => {
  const ruta = fs.readFileSync(path.join(RAIZ, "app/api/voice/elevenlabs/context/route.js"), "utf8");
  assert.match(ruta, /lead_nombre: ctx\.leadName \|\| "",\s*lead_necesidad: "",\s*resumen_contacto: ""/);
  assert.match(ruta, /leadStatus: "",\s*leadOwner: "",\s*leadSummary: "",\s*callObjective: ""/);
  assert.doesNotMatch(ruta, /leadName: ""/);
  assert.match(ruta, /CADA LLAMADA ES UN EXPEDIENTE NUEVO, SALVO EL NOMBRE/);
  assert.match(ruta, /Esta regla prevalece sobre cualquier instrucción general/);
  assert.match(ruta, /el identificador de llamada no cuenta como confirmado/);
  assert.match(ruta, /salúdale por su nombre/);
  assert.doesNotMatch(ruta, /ctx\.callObjective/);
  assert.match(ruta, /lead_id: ctx\.leadId/, "el enlace con la ficha se conserva");
  const eleven = fs.readFileSync(path.join(RAIZ, "lib/server/elevenlabs.js"), "utf8");
  assert.match(eleven, /type: "datos_de_llamada"/);
  assert.match(eleven, /aislarLlamada: true/);
  const dest = fs.readFileSync(path.join(RAIZ, "lib/server/destinatarios.js"), "utf8");
  assert.match(dest, /eq\("type", "datos_de_llamada"\)/);
  assert.doesNotMatch(dest, /hace15|15 \* 60e3/, "otra llamada cercana no se considera duplicada");
  assert.ok(
    dest.includes('.eq("motivo", `llamada:${callSid}`)'),
    "sólo se deduplica el correo de la misma conversación",
  );
});
