import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ajustesSegurosParaNavegador } from "../../lib/client-settings.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

test("el overview no entrega el hash del PIN de Ruperta al navegador", () => {
  const settings = {
    client_id: "empresa-a",
    ruperta_pin_hash: "hash-que-no-debe-salir",
    realtime_refresh_seconds: 30,
  };

  assert.deepEqual(ajustesSegurosParaNavegador(settings), {
    client_id: "empresa-a",
    realtime_refresh_seconds: 30,
  });
  assert.equal(settings.ruperta_pin_hash, "hash-que-no-debe-salir", "el DTO no muta la fila original");

  const overview = fs.readFileSync(
    path.join(RAIZ, "app/api/portal/overview/route.js"),
    "utf8",
  );
  assert.match(
    overview,
    /\.\.\.ajustesSegurosParaNavegador\(settings\)/,
    "la ruta que carga todos los ajustes debe pasar por el DTO seguro",
  );
});
