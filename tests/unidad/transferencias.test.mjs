import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  HUECOS_DE_TRANSFERENCIA,
  huecosDeTransferencia,
  variablesDeTransferencia,
  reglasDeTransferencia,
  transferenciaDeLaConversacion,
} from "../../lib/server/transferencias.js";
import { Departamentos } from "../../lib/server/esquemas-portal.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/**
 * Pasar la llamada a una persona del departamento.
 *
 * Lo que tiene que ser verdad para que esto no haga daño:
 *   · sólo se ofrece en horario y a departamentos activos con teléfono;
 *   · el agente siempre recibe todas sus variables, aunque vayan vacías (si
 *     falta una, ElevenLabs no descuelga);
 *   · la asistente pide permiso y nunca dice el teléfono interno;
 *   · lo que queda en el portal dice a qué departamento se pasó.
 */

const DEPARTAMENTOS = [
  { clave: "ventas", nombre: "Ventas", activo: true, telefono_transferencia: "600111222" },
  { clave: "soporte", nombre: "Soporte técnico", activo: true, telefono_transferencia: "+34 600 333 444" },
  { clave: "administracion", nombre: "Administración", activo: true, telefono_transferencia: "" },
  { clave: "direccion", nombre: "Dirección", activo: false, telefono_transferencia: "+34600555666" },
];

test("sólo se ofrecen departamentos activos con teléfono, en su orden y normalizados", () => {
  const huecos = huecosDeTransferencia(DEPARTAMENTOS, { enHorario: true });

  assert.deepEqual(huecos, [
    { hueco: 1, clave: "ventas", nombre: "Ventas", telefono: "+34600111222" },
    { hueco: 2, clave: "soporte", nombre: "Soporte técnico", telefono: "+34600333444" },
  ]);
});

test("fuera de horario no se ofrece pasar a nadie", () => {
  assert.deepEqual(huecosDeTransferencia(DEPARTAMENTOS, { enHorario: false }), []);
  assert.match(reglasDeTransferencia([]), /No lo ofrezcas/);
});

test("como mucho tantos departamentos como reglas tiene el agente", () => {
  const muchos = Array.from({ length: 6 }, (_, i) => ({ clave: `d${i}`, nombre: `D${i}`, activo: true, telefono_transferencia: `+3460000000${i}` }));
  assert.equal(huecosDeTransferencia(muchos).length, HUECOS_DE_TRANSFERENCIA);
});

test("el agente recibe siempre todas las variables, vacías si no hay departamento", () => {
  const vacias = variablesDeTransferencia([]);
  assert.equal(Object.keys(vacias).length, HUECOS_DE_TRANSFERENCIA * 2);
  assert.ok(Object.values(vacias).every((v) => v === ""));

  const con = variablesDeTransferencia(huecosDeTransferencia(DEPARTAMENTOS));
  assert.equal(con.transferir_1_nombre, "Ventas");
  assert.equal(con.transferir_2_telefono, "+34600333444");
  assert.equal(con.transferir_3_telefono, "", "Administración no tiene teléfono: su hueco va vacío");
});

test("las reglas piden permiso, nombran sólo los departamentos disponibles y no dicen teléfonos", () => {
  const huecos = huecosDeTransferencia(DEPARTAMENTOS);
  const texto = reglasDeTransferencia(huecos);

  assert.match(texto, /Departamento 1: Ventas/);
  assert.match(texto, /Departamento 2: Soporte técnico/);
  assert.doesNotMatch(texto, /Administración|Dirección/, "sólo los que se pueden pasar");
  assert.match(texto, /sólo si la persona dice claramente que sí/);
  assert.match(texto, /Nunca digas en voz alta el teléfono/);
  assert.doesNotMatch(texto, /\+34|600/, "los teléfonos van en variables, no en el texto que lee el modelo");
});

test("al colgar se sabe a qué departamento se pasó", () => {
  const variables = variablesDeTransferencia(huecosDeTransferencia(DEPARTAMENTOS));
  const transcript = [
    { role: "user", message: "No me funciona la fibra." },
    { role: "agent", message: "Le paso, un momento.", tool_calls: [{ tool_name: "transfer_to_number", params_as_json: JSON.stringify({ transfer_number: "+34600333444", client_message: "Le paso" }) }] },
  ];

  assert.deepEqual(transferenciaDeLaConversacion(transcript, variables), { departamento: "Soporte técnico", hueco: 2 });
  assert.equal(transferenciaDeLaConversacion([{ role: "agent", message: "Hasta luego" }], variables), null);
  assert.deepEqual(
    transferenciaDeLaConversacion([{ role: "agent", tool_calls: [{ tool_name: "transfer_to_number", params_as_json: "no es json" }] }], variables),
    { departamento: "un departamento", hueco: null },
    "si no se reconoce el número, se dice igualmente que se pasó",
  );
});

test("el portal valida y normaliza el teléfono de cada departamento", () => {
  const ok = Departamentos.safeParse({ departamentos: [{ clave: "soporte", nombre: "Soporte técnico", telefono_transferencia: "600 333 444" }] });
  assert.equal(ok.success, true);
  assert.equal(ok.data.departamentos[0].telefono_transferencia, "+34600333444");

  const vacio = Departamentos.safeParse({ departamentos: [{ clave: "ventas", nombre: "Ventas" }] });
  assert.equal(vacio.data.departamentos[0].telefono_transferencia, "", "vacío: no se ofrece pasar");

  const malo = Departamentos.safeParse({ departamentos: [{ clave: "ventas", nombre: "Ventas", telefono_transferencia: "llamar a Juan" }] });
  assert.equal(malo.success, false);
});

test("el contexto lleva las reglas al principio y todas las variables, también si falla", () => {
  const s = fs.readFileSync(path.join(RAIZ, "app/api/voice/elevenlabs/context/route.js"), "utf8");
  const bloque = s.slice(s.indexOf("contexto_empresa: ["));
  assert.match(bloque.split("reglasDeTransferencia(huecos)")[0], /^contexto_empresa: \[\s*\/\*[\s\S]*\*\/\s*$/, "va lo primero");
  assert.match(s, /\.\.\.variablesDeTransferencia\(huecos\)/);
  const catchBlock = s.slice(s.indexOf("} catch (error) {"));
  assert.match(catchBlock, /\.\.\.variablesDeTransferencia\(\[\]\)/, "sin contexto, huecos vacíos: el agente sigue descolgando");
});

test("el script del agente usa los mismos nombres de variable y transferencia con resumen", () => {
  const s = fs.readFileSync(path.join(RAIZ, "scripts/configurar-transferencias.mjs"), "utf8");
  for (const nombre of Object.keys(variablesDeTransferencia([]))) {
    const plantilla = nombre.replace(/\d+/, "${n}").replace(/\d+/, "${i + 1}");
    assert.ok(s.includes(plantilla) || s.includes(nombre.replace(/\d+/, "${i + 1}")), `${nombre} no está en el script`);
  }
  assert.match(s, /transfer_type: "conference"/);
  assert.match(s, /const HUECOS = 3;/);
  assert.equal(HUECOS_DE_TRANSFERENCIA, 3, "el agente tiene tantas reglas como huecos manda Nesped");
  assert.match(s, /--quitar/);
  /* Las herramientas webhook llevan el token interno en sus cabeceras: el
     script puede nombrarlas, pero nunca volcarlas. */
  assert.doesNotMatch(s, /request_headers|JSON\.stringify\((tools|existente|quedo|nueva|a|b)\b/, "no vuelca herramientas");
  assert.match(s, /\.map\(\(t\) => t\.name\)/, "sólo imprime nombres");
});

test("el registro de auditoría guarda qué departamentos pasan llamadas, no los teléfonos", () => {
  const s = fs.readFileSync(path.join(RAIZ, "app/api/portal/departamentos/route.js"), "utf8");
  const auditoria = s.slice(s.indexOf('from("audit_logs")'), s.indexOf('from("audit_logs")') + 250);
  assert.match(auditoria, /conTransferencia/);
  assert.doesNotMatch(auditoria, /telefono_transferencia/);
});
