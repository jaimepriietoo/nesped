import { test } from "node:test";
import assert from "node:assert/strict";
import { PARA_PRUEBAS } from "@/lib/server/mantenimiento";

const { LOTE, PRESUPUESTO_MS, plazos } = PARA_PRUEBAS;

/**
 * El mantenimiento mueve historial viejo a un archivo y, la última de todas,
 * borra del archivo lo que ya no hay obligación de guardar. Es el único
 * trabajo del sistema que borra datos de clientes, así que lo que se prueba
 * aquí son los números que deciden cuánto se guarda.
 */

test("archivar es mucho antes que borrar", () => {
  /* Si la purga alcanzara al archivado, una fila pasaría por el archivo sin
     llegar a estar guardada: se movería y se borraría casi seguido. */
  const p = plazos();
  assert.ok(p.purga > p.auditoria * 2, "la purga tiene que ir muy por detrás");
  assert.ok(p.purga > p.eventos * 2);
});

test("la auditoría se guarda más que el historial de contacto", () => {
  /* Un registro de auditoría puede pedirlo alguien de fuera; el recorrido de
     un contacto sólo se mira mientras está vivo. */
  const p = plazos();
  assert.ok(p.auditoria >= p.eventos);
});

test("los plazos se pueden cambiar sin tocar código", () => {
  /* Cuánto se guarda un registro es una decisión legal, no técnica. */
  const antes = process.env.ARCHIVO_AUDITORIA_DIAS;
  process.env.ARCHIVO_AUDITORIA_DIAS = "730";
  try {
    assert.equal(plazos().auditoria, 730);
  } finally {
    if (antes === undefined) delete process.env.ARCHIVO_AUDITORIA_DIAS;
    else process.env.ARCHIVO_AUDITORIA_DIAS = antes;
  }
});

test("un plazo con basura no deja el archivado sin plazo", () => {
  /* Un cero o un texto en la variable haría que make_interval recibiera algo
     raro, y en el peor caso que se archivara todo, incluido lo de hoy. */
  const antes = process.env.ARCHIVO_EVENTOS_DIAS;
  for (const malo of ["0", "-5", "hola", ""]) {
    process.env.ARCHIVO_EVENTOS_DIAS = malo;
    assert.equal(plazos().eventos, 180, `con "${malo}" debería caer al valor por defecto`);
  }
  if (antes === undefined) delete process.env.ARCHIVO_EVENTOS_DIAS;
  else process.env.ARCHIVO_EVENTOS_DIAS = antes;
});

test("el lote y el presupuesto son de tamaño humano", () => {
  /* Un lote enorme coge un bloqueo largo y puede tumbar la base de datos
     durante el rato que dura. Un presupuesto largo agota el tiempo de la
     función y el trabajo se queda colgado. */
  assert.ok(LOTE > 0 && LOTE <= 10_000);
  assert.ok(PRESUPUESTO_MS >= 5_000 && PRESUPUESTO_MS <= 45_000);
});
