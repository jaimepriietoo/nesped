import { test } from "node:test";
import assert from "node:assert/strict";
import { PARA_PRUEBAS, INFORMES } from "@/lib/server/informes";

const { escapar, cuerpoDiario } = PARA_PRUEBAS;

/**
 * Los informes van por correo, y en un correo el HTML no es decorativo: hay
 * clientes que ejecutan lo que les llega. El nombre de la marca lo escribe el
 * propio cliente en sus ajustes, así que no es un ataque de un desconocido,
 * pero un nombre con un `<` de más rompía el correo y uno con etiquetas hacía
 * cosas peores.
 */

test("el nombre de la marca sale escapado", () => {
  const html = cuerpoDiario('<script>alert(1)</script>', {
    total: 0, calientes: 0, ganados: 0, pipeline: 0,
  });
  assert.ok(!html.includes("<script>"), "no puede quedar una etiqueta viva");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("escapa los cinco que cambian el significado", () => {
  assert.equal(escapar(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("el ampersand se escapa primero: si no, se escapan dos veces", () => {
  /* Si `&` se hiciera al final, el `&lt;` recién creado se convertiría en
     `&amp;lt;` y el correo enseñaría el código en vez del signo. */
  assert.equal(escapar("<"), "&lt;");
  assert.equal(escapar("&lt;"), "&amp;lt;");
});

test("un nombre vacío no imprime 'undefined' en el correo del cliente", () => {
  assert.equal(escapar(undefined), "");
  assert.equal(escapar(null), "");
});

test("las cifras se pintan tal cual las da la base de datos", () => {
  const html = cuerpoDiario("Fibergreen", {
    total: 128, calientes: 9, ganados: 4, pipeline: 15400,
  });
  assert.ok(html.includes("Total de contactos:</strong> 128"));
  assert.ok(html.includes("15400€"));
});

test("solo existen los informes que sabe hacer el trabajador", () => {
  /* El trabajador tiene un oficio por tipo. Si aquí apareciera un informe sin
     su oficio, encolarlo fallaría cinco veces y se abandonaría. */
  assert.deepEqual(Object.keys(INFORMES).sort(), ["diario", "semanal"]);
});
