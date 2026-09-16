import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATALOGO, POR_ID, automatismosDeEmpresa, fijarAutomatismo, MODOS } from "@/lib/server/automatismos";
import { normalizarConfigIA, dentroDeHorario, promptDeEmpresa, POR_DEFECTO } from "@/lib/server/ia-config";
import { pedirRestablecimiento, restablecerConToken, PARA_PRUEBAS } from "@/lib/server/restablecer";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

/**
 * Automatismos, configuración de la IA y restablecer la contraseña. Lo que
 * se sujeta es la forma: el catálogo es coherente, lo que se guarda se
 * valida contra él, la configuración de la IA sale siempre completa, y el
 * restablecimiento no delata cuentas ni manda correo en pruebas.
 */

test("el catálogo es coherente: ids únicos, modos válidos, el fijo no se apaga", () => {
  const ids = CATALOGO.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 22, `hay ${ids.length} piezas`);
  for (const a of CATALOGO) {
    assert.ok(a.modos.every((m) => MODOS.includes(m)), a.id);
    assert.ok(a.modos.includes(a.porDefecto), `${a.id}: el modo por defecto tiene que estar entre los permitidos`);
    assert.ok(["lead.nuevo", "lead.clasificado", "mensaje.entrante", "barrido"].includes(a.cuando), a.id);
    for (const c of a.config) assert.ok(["numero", "hora", "email", "departamento"].includes(c.tipo), `${a.id}.${c.clave}`);
  }
  assert.equal(POR_ID.bloquear_sin_consentimiento.fijo, true);
  assert.equal(POR_ID.notificar_departamentos.activoPorDefecto, true, "avisar por correo va encendido de serie");
});

function baseFalsa(filas = {}) {
  const apuntes = [];
  const from = (tabla) => {
    const b = { _op: "select", _datos: null,
      select() { return b; }, eq() { return b; }, in() { return b; }, order() { return b; }, limit() { return b; },
      upsert(d, o) { b._op = "upsert"; b._datos = d; b._o = o; return b; }, insert(d) { b._op = "insert"; b._datos = d; return b; },
      maybeSingle() { return b; },
      then(r) { apuntes.push({ tabla, op: b._op, datos: b._datos, o: b._o }); return Promise.resolve({ data: b._op === "select" ? (filas[tabla] ?? []) : b._datos, error: null }).then(r); },
    };
    return b;
  };
  return { apuntes, from };
}

test("las filas de la empresa se funden con el catálogo: defaults, modo válido y valores de config", async () => {
  const base = baseFalsa({ automatismos: [
    { tipo: "etiquetar", activo: false, modo: "solo", config: {} },
    { tipo: "tarea_seguimiento", activo: true, modo: "modo-viejo", config: { horas: 6 } },
  ] });
  const piezas = await automatismosDeEmpresa("acme", base);
  const por = Object.fromEntries(piezas.map((p) => [p.id, p]));
  assert.equal(por.etiquetar.activo, false, "lo guardado manda sobre el default");
  assert.equal(por.notificar_departamentos.activo, true, "sin fila, el default");
  assert.equal(por.tarea_seguimiento.modo, "solo", "un modo que ya no existe cae al de serie");
  assert.equal(por.tarea_seguimiento.config.horas, 6);
  assert.equal(por.avisar_sin_respuesta.config.minutos, 30, "el valor por defecto del campo");
  assert.ok(Array.isArray(por.tarea_seguimiento.campos), "los campos configurables viajan aparte de los valores");
});

test("guardar valida contra el catálogo: tipo, modo permitido, el fijo, y los números se acotan", async () => {
  const base = baseFalsa();
  await assert.rejects(() => fijarAutomatismo("acme", "cohetes", { activo: true }, base), /desconocido/);
  await assert.rejects(() => fijarAutomatismo("acme", "bloquear_sin_consentimiento", { activo: false }, base), /no se puede apagar/);
  await assert.rejects(() => fijarAutomatismo("acme", "notificar_departamentos", { modo: "avisar" }, base), /Modo no permitido/);
  const fila = await fijarAutomatismo("acme", "avisar_sin_respuesta", { activo: true, config: { minutos: 99999, otra: "x" } }, base);
  assert.equal(fila.config.minutos, 1440);
  assert.equal(fila.config.otra, undefined, "lo que no está en el catálogo no se guarda");
  assert.equal(base.apuntes.at(-1).o.onConflict, "client_id,tipo");
});

test("la configuración de la IA sale completa y limpia, con o sin datos", () => {
  const vacia = normalizarConfigIA({});
  assert.equal(vacia.tono, POR_DEFECTO.tono);
  assert.equal(vacia.autonomia, 3);
  assert.deepEqual(vacia.horario.dias, [1, 2, 3, 4, 5]);
  const sucia = normalizarConfigIA({ tono: "gritón", autonomia: 9, puede: ["  ok ", "", 5], horario: { desde: "9", hasta: "18:30" }, reglas_derivacion: [{ si: "obra", departamento: "instalaciones" }, { si: "", departamento: "x" }], instrucciones: "x".repeat(5000) });
  assert.equal(sucia.tono, "cercano");
  assert.equal(sucia.autonomia, 3);
  assert.deepEqual(sucia.puede, ["ok", "5"]);
  assert.equal(sucia.horario.desde, "09:00");
  assert.equal(sucia.horario.hasta, "18:30");
  assert.equal(sucia.reglas_derivacion.length, 1);
  assert.equal(sucia.instrucciones.length, 4000);
});

test("el horario se respeta y el prompt lleva lo que la empresa decidió", () => {
  const cfg = normalizarConfigIA({ horario: { dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "18:00" }, no_puede: ["Dar precios"], instrucciones: "Somos de Valladolid." });
  assert.equal(dentroDeHorario(cfg, new Date("2026-09-16T08:00:00Z")), true, "miércoles 10:00 en Madrid");
  assert.equal(dentroDeHorario(cfg, new Date("2026-09-19T10:00:00Z")), false, "sábado");
  assert.equal(dentroDeHorario(cfg, new Date("2026-09-16T20:00:00Z")), false, "22:00");
  const prompt = promptDeEmpresa(cfg, { empresa: "Fibergreen", departamentos: [{ nombre: "Soporte", descripcion: "averías" }] });
  assert.match(prompt, /Fibergreen/);
  assert.match(prompt, /NO PUEDES, NUNCA: Dar precios/);
  assert.match(prompt, /Somos de Valladolid/);
  assert.match(prompt, /Soporte \(averías\)/);
  assert.match(prompt, /lunes, martes, miércoles, jueves, viernes de 09:00 a 18:00/);
});

function baseReset(filas = {}) {
  const apuntes = [];
  const from = (tabla) => {
    const b = { _op: "select", _datos: null,
      select() { return b; }, eq() { return b; }, limit() { return b; }, maybeSingle() { return b; },
      insert(d) { b._op = "insert"; b._datos = d; return b; }, update(d) { b._op = "update"; b._datos = d; return b; },
      then(r) { apuntes.push({ tabla, op: b._op, datos: b._datos }); return Promise.resolve({ data: b._op === "select" ? (filas[tabla] ?? null) : b._datos, error: null }).then(r); },
    };
    return b;
  };
  return { apuntes, from };
}

test("pedir el restablecimiento contesta igual exista o no la cuenta, y en pruebas no manda correo", async () => {
  const noExiste = await pedirRestablecimiento("nadie@acme.es", { supabase: baseReset({ users: null }) });
  assert.equal(noExiste.pedido, true);
  const base = baseReset({ users: { email: "ana@acme.es", client_id: "acme" } });
  const existe = await pedirRestablecimiento("Ana@acme.es", { supabase: base });
  assert.equal(existe.pedido, true);
  const fila = base.apuntes.find((a) => a.tabla === "restablecer_password" && a.op === "insert");
  assert.equal(fila.datos.email, "ana@acme.es");
  assert.match(fila.datos.token_hash, /^[a-f0-9]{64}$/, "a la base sólo va el hash");
  assert.equal(existe.detalle, "correo desactivado");
});

test("restablecer con un token malo o caducado falla claro; con uno bueno cambia y cierra sesiones", async () => {
  await assert.rejects(() => restablecerConToken({ token: "x".repeat(30), password: "Nueva-clave-larga-2026", supabase: baseReset({ restablecer_password: null }) }), /no es válido o ha caducado/);
  const caducado = { id: "r1", email: "ana@acme.es", client_id: "acme", expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null };
  await assert.rejects(() => restablecerConToken({ token: "x".repeat(30), password: "Nueva-clave-larga-2026", supabase: baseReset({ restablecer_password: caducado }) }), /caducado/);

  const vigente = { ...caducado, expires_at: new Date(Date.now() + 60000).toISOString() };
  const base = baseReset({ restablecer_password: vigente });
  let revocado = null;
  await restablecerConToken({ token: "x".repeat(30), password: "Nueva-clave-larga-2026", supabase: base, revocar: async (e) => { revocado = e; } });
  const cambio = base.apuntes.find((a) => a.tabla === "users" && a.op === "update");
  assert.match(cambio.datos.password_hash, /^scrypt\$/);
  assert.equal(cambio.datos.password, cambio.datos.password_hash);
  assert.equal(revocado, "ana@acme.es");
  assert.ok(base.apuntes.some((a) => a.tabla === "restablecer_password" && a.op === "update" && a.datos.used_at));
  assert.equal(typeof PARA_PRUEBAS.hashDe("a"), "string");
});

test("el login enlaza a '¿Has olvidado tu contraseña?' y la ruta de recuperar no revela cuentas", () => {
  assert.match(leer("app/login/page.js"), /Has olvidado tu contraseña/);
  const ruta = leer("app/api/login/recuperar/route.js");
  assert.match(ruta, /requireRateLimitAsync/);
  assert.equal((ruta.match(/success: true, message: MENSAJE/g) || []).length, 2, "misma respuesta si existe, si no existe y si falla el envío");
});
