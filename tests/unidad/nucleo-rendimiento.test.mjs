import test from "node:test";
import assert from "node:assert/strict";
import { NucleoRender } from "../../components/nucleo/gl/render.js";

test("un plano interior lento reduce calidad sin degradar el exterior al volver", (t) => {
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => { if (raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = raf; });
  const anterior = globalThis.document;
  globalThis.document = { hidden: false };
  t.after(() => { if (anterior === undefined) delete globalThis.document; else globalThis.document = anterior; });
  const motor = new NucleoRender({ dataset: {} });
  motor.vivo = true;
  motor.pintar = () => {};
  motor.construir = () => {};
  motor.redimensionar = () => {};
  motor.direccion.dentro = 1;
  for (let i = 1; i <= 90; i += 1) motor.fotograma(i * 40);
  assert.equal(motor.nivel, "baja");
  motor.direccion.dentro = 0;
  motor.fotograma(3616);
  assert.equal(motor.nivel, "alta");
  motor.direccion.dentro = 1;
  motor.fotograma(3632);
  assert.equal(motor.nivel, "baja");
});

test("cambiar calidad conserva los destinos hasta que se liberen al redimensionar", () => {
  const motor = new NucleoRender({});
  const escena = { fbo: "anterior" };
  motor.destinos.escena = escena;
  motor.construir = () => {};
  let conservado = false;
  motor.redimensionar = () => { conservado = motor.destinos.escena === escena; };
  motor.bajarNivel(20);
  assert.ok(conservado, "no perder la referencia al framebuffer antes de liberarlo");
});
