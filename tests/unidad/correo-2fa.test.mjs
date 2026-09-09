import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTwoFactorEmail } from "@/lib/server/two-factor.mjs";

/**
 * El contrato entre el código de acceso y la puerta del correo.
 *
 * `enviarPorEmail` hace esto:
 *
 *     enviarCorreo({ quienEspera: "persona", ...buildTwoFactorEmail(...) })
 *
 * o sea que el mensaje entero sale de esta función. Si algún día se le cayera
 * el `to`, Resend recibiría un envío sin destinatario y NADIE recibiría su
 * código de acceso. Y no lo cazaría ninguna prueba de punta a punta, porque
 * esas simulan la respuesta de la API.
 *
 * Es la última puerta del producto: si esto falla, no entra nadie.
 */

test("el mensaje lleva destinatario", () => {
  const m = buildTwoFactorEmail({ email: "alguien@ejemplo.invalid", code: "123456" });
  assert.ok(m.to, "sin `to` el correo no sale y nadie entra");
  assert.deepEqual(m.to, ["alguien@ejemplo.invalid"]);
});

test("el mensaje lleva remitente", () => {
  /* Resend rechaza un envío sin `from`, y además el remitente tiene que ser un
     dominio verificado: mandar desde uno sin verificar no da error visible,
     simplemente no llega. */
  const m = buildTwoFactorEmail({ email: "alguien@ejemplo.invalid", code: "123456" });
  assert.ok(m.from, "sin `from` no sale");
  assert.match(m.from, /@/);
});

test("el código va en el cuerpo, en texto y en HTML", () => {
  /* Hay clientes de correo que sólo pintan el texto plano. */
  const m = buildTwoFactorEmail({ email: "alguien@ejemplo.invalid", code: "778899" });
  assert.ok(m.text.includes("778899"), "falta en el texto plano");
  assert.ok(m.html.includes("778899"), "falta en el HTML");
});

test("el asunto dice de qué es, sin llevar el código", () => {
  /* El asunto se ve en la notificación del móvil y en la pantalla bloqueada.
     Un código de acceso ahí lo lee cualquiera que mire por encima del hombro. */
  const m = buildTwoFactorEmail({ email: "a@ejemplo.invalid", code: "112233", clientName: "Fibergreen" });
  assert.ok(m.subject.includes("Fibergreen"));
  assert.ok(!m.subject.includes("112233"), "el código no puede ir en el asunto");
});
