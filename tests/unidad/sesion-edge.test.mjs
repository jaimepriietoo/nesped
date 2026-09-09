import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { leerSesionFirmada } from "../../lib/sesion-edge.js";

/**
 * Lo que protege esto: el middleware decidía quién entra en /admin mirando la
 * cookie `nesped_role`, que va en claro. Escribiendo `nesped_role=admin` en el
 * navegador se pasaba el control, y para /portal bastaba con que
 * `nesped_session` tuviera cualquier valor.
 *
 * Ahora se verifica la firma. Esta prueba existe para que nadie vuelva a la
 * cookie suelta buscando comodidad, y para cubrir los casos que a mano no se
 * prueban: el token caducado, el emitido en el futuro, el firmado con otra
 * clave.
 */

const SECRETO = "secreto-de-pruebas-que-no-vale-para-nada";

function firmar(carga, clave = SECRETO) {
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString("base64url");
  const firma = crypto.createHmac("sha256", clave).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

/** Un `req` con lo mínimo que mira el módulo. */
function peticionCon(token) {
  return { cookies: { get: (n) => (n === "nesped_session" && token ? { value: token } : undefined) } };
}

function conSecreto(fn) {
  const previo = process.env.NESPED_SESSION_SECRET;
  process.env.NESPED_SESSION_SECRET = SECRETO;
  try {
    return fn();
  } finally {
    if (previo === undefined) delete process.env.NESPED_SESSION_SECRET;
    else process.env.NESPED_SESSION_SECRET = previo;
  }
}

const ahora = () => Date.now();

test("acepta un token bien firmado y en plazo", async () => {
  const sesion = await conSecreto(() =>
    leerSesionFirmada(
      peticionCon(firmar({ email: "a@b.c", role: "admin", issuedAt: ahora(), expiresAt: ahora() + 60000 }))
    )
  );
  assert.equal(sesion?.role, "admin");
  assert.equal(sesion?.email, "a@b.c");
});

test("rechaza un token firmado con otra clave", async () => {
  const sesion = await conSecreto(() =>
    leerSesionFirmada(
      peticionCon(firmar({ role: "admin", issuedAt: ahora(), expiresAt: ahora() + 60000 }, "otra-clave"))
    )
  );
  assert.equal(sesion, null);
});

test("rechaza el rol cambiado a mano dentro del token", async () => {
  const bueno = firmar({ role: "client", issuedAt: ahora(), expiresAt: ahora() + 60000 });
  const [, firma] = bueno.split(".");

  // Mismo truco que intentaría alguien: reescribir la carga y dejar la firma.
  const cargaTocada = Buffer.from(
    JSON.stringify({ role: "admin", issuedAt: ahora(), expiresAt: ahora() + 60000 })
  ).toString("base64url");

  const sesion = await conSecreto(() => leerSesionFirmada(peticionCon(`${cargaTocada}.${firma}`)));
  assert.equal(sesion, null);
});

test("rechaza una cookie inventada", async () => {
  for (const basura of ["loquesea", "a.b", "", null]) {
    const sesion = await conSecreto(() => leerSesionFirmada(peticionCon(basura)));
    assert.equal(sesion, null, `${basura} no debería valer`);
  }
});

test("rechaza un token caducado", async () => {
  const sesion = await conSecreto(() =>
    leerSesionFirmada(peticionCon(firmar({ role: "admin", issuedAt: ahora() - 7200000, expiresAt: ahora() - 3600000 })))
  );
  assert.equal(sesion, null);
});

/**
 * Un token con fecha de emisión en el futuro no es un error de reloj: es un
 * intento de fabricar uno que dure más de lo que debería.
 */
test("rechaza un token emitido en el futuro", async () => {
  const sesion = await conSecreto(() =>
    leerSesionFirmada(peticionCon(firmar({ role: "admin", issuedAt: ahora() + 3600000, expiresAt: ahora() + 7200000 })))
  );
  assert.equal(sesion, null);
});

test("sin secreto configurado no valida nada", async () => {
  const previo = process.env.NESPED_SESSION_SECRET;
  const previoServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NESPED_SESSION_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const sesion = await leerSesionFirmada(
      peticionCon(firmar({ role: "admin", issuedAt: ahora(), expiresAt: ahora() + 60000 }))
    );
    assert.equal(sesion, null, "sin clave, nada pasa: el lado seguro");
  } finally {
    if (previo !== undefined) process.env.NESPED_SESSION_SECRET = previo;
    if (previoServicio !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previoServicio;
  }
});
