import assert from "node:assert/strict";
import test from "node:test";

import { campoCsvSeguro } from "../../lib/server/csv.js";

test("el CSV neutraliza fórmulas incluso tras espacios o controles", () => {
  for (const valor of ["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\t=1+1", "  =1+1"]) {
    assert.ok(campoCsvSeguro(valor).includes(`'${valor}`), valor);
  }
});

test("el CSV conserva texto normal y escapa comas, comillas y saltos", () => {
  assert.equal(campoCsvSeguro("Málaga"), "Málaga");
  assert.equal(campoCsvSeguro('Ana, "Ventas"'), '"Ana, ""Ventas"""');
  assert.equal(campoCsvSeguro("línea 1\nlínea 2"), '"línea 1\nlínea 2"');
});
