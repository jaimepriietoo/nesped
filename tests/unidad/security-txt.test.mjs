import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const txt = fs.readFileSync(path.join(RAIZ, "public/.well-known/security.txt"), "utf8");

test("security.txt tiene contacto, caduca en menos de un año y enlaza a la página de seguridad", () => {
  assert.match(txt, /^Contact: mailto:seguridad@nesped\.com$/m);
  const caduca = /^Expires: (.+)$/m.exec(txt)?.[1];
  assert.ok(caduca, "falta Expires");
  const dias = (Date.parse(caduca) - Date.now()) / 86_400_000;
  assert.ok(dias > 0, "security.txt ya ha caducado: hay que renovar la fecha");
  assert.ok(dias < 366, "la RFC 9116 pide que Expires esté a menos de un año");
  assert.match(txt, /^Policy: https:\/\/www\.nesped\.com\/seguridad$/m);
  assert.match(txt, /^Canonical: https:\/\/www\.nesped\.com\/\.well-known\/security\.txt$/m);
});

test("la página /seguridad existe, es pública y enlaza al fichero", () => {
  const pagina = fs.readFileSync(path.join(RAIZ, "app/seguridad/page.js"), "utf8");
  assert.match(pagina, /seguridad@nesped\.com/);
  assert.match(pagina, /\.well-known\/security\.txt/);
  assert.doesNotMatch(pagina, /getPortalContext|getSupabase/, "no toca datos de nadie");
  const chrome = fs.readFileSync(path.join(RAIZ, "components/v3/chrome.js"), "utf8");
  assert.match(chrome, /href="\/seguridad"/, "el pie enlaza a la página");
});
