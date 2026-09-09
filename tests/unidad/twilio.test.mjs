import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verificarWebhookTwilio,
  leerWebhookDeMensajeria,
  normalizePhone,
} from "@/lib/server/twilio";

/**
 * La firma de los webhooks de Twilio.
 *
 * Es la única puerta que separa "un cliente ha escrito por WhatsApp" de
 * "cualquiera puede inyectar mensajes en la bandeja de una empresa". Y si se
 * equivoca en el otro sentido, WhatsApp deja de funcionar entero y en
 * silencio: los mensajes llegan, se rechazan con un 403 y nadie mira.
 *
 * Twilio firma con HMAC-SHA1 sobre la URL completa más los campos del cuerpo
 * ordenados por nombre y concatenados. Aquí se construye una firma buena con
 * ese mismo procedimiento y se comprueba que la acepta, y que rechaza todo lo
 * demás.
 */

const TOKEN = "un-token-de-prueba-que-no-es-real";
const URL_WEBHOOK = "https://www.nesped.com/api/whatsapp/webhook";

function firmar(url, params, token = TOKEN) {
  const cadena = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + String(params[k] ?? ""), url);
  return crypto.createHmac("sha1", token).update(Buffer.from(cadena, "utf8")).digest("base64");
}

const CAMPOS = {
  From: "whatsapp:+34600111222",
  To: "whatsapp:+34983460825",
  Body: "Hola, quería información",
  MessageSid: "SM1234567890",
};

test("acepta una firma construida como la construye Twilio", () => {
  assert.equal(
    verificarWebhookTwilio({
      url: URL_WEBHOOK,
      params: CAMPOS,
      signature: firmar(URL_WEBHOOK, CAMPOS),
      authToken: TOKEN,
    }),
    true
  );
});

test("el orden de los campos no cambia el resultado", () => {
  /* Twilio ordena por nombre antes de firmar. Si aquí se dependiera del orden
     en que llegan, la firma fallaría según el capricho del formulario. */
  const alReves = Object.fromEntries(Object.entries(CAMPOS).reverse());
  assert.equal(
    verificarWebhookTwilio({
      url: URL_WEBHOOK,
      params: alReves,
      signature: firmar(URL_WEBHOOK, CAMPOS),
      authToken: TOKEN,
    }),
    true
  );
});

test("un cuerpo cambiado invalida la firma", () => {
  /* Es el ataque que esto viene a parar: coger un webhook legítimo y
     cambiarle el texto o el remitente. */
  assert.equal(
    verificarWebhookTwilio({
      url: URL_WEBHOOK,
      params: { ...CAMPOS, Body: "Transfiéreme mil euros" },
      signature: firmar(URL_WEBHOOK, CAMPOS),
      authToken: TOKEN,
    }),
    false
  );
});

test("una URL distinta invalida la firma", () => {
  assert.equal(
    verificarWebhookTwilio({
      url: "https://www.nesped.com/api/otra-cosa",
      params: CAMPOS,
      signature: firmar(URL_WEBHOOK, CAMPOS),
      authToken: TOKEN,
    }),
    false
  );
});

test("otro token invalida la firma", () => {
  assert.equal(
    verificarWebhookTwilio({
      url: URL_WEBHOOK,
      params: CAMPOS,
      signature: firmar(URL_WEBHOOK, CAMPOS, "otro-token"),
      authToken: TOKEN,
    }),
    false
  );
});

test("sin firma, sin token o sin URL no pasa", () => {
  /* Devolver true cuando falta algo convertiría un despiste de configuración
     en una puerta abierta. */
  const base = { url: URL_WEBHOOK, params: CAMPOS, signature: firmar(URL_WEBHOOK, CAMPOS), authToken: TOKEN };
  assert.equal(verificarWebhookTwilio({ ...base, signature: "" }), false);
  assert.equal(verificarWebhookTwilio({ ...base, authToken: "" }), false);
  assert.equal(verificarWebhookTwilio({ ...base, url: "" }), false);
});

test("una firma de longitud distinta no revienta, devuelve false", () => {
  /* timingSafeEqual lanza si los buffers miden distinto. Lanzar aquí sería
     un 500 en un webhook, y Twilio lo reintentaría en bucle. */
  assert.equal(
    verificarWebhookTwilio({ url: URL_WEBHOOK, params: CAMPOS, signature: "corta", authToken: TOKEN }),
    false
  );
});

test("lee un mensaje de WhatsApp quitando el prefijo", () => {
  /* Twilio manda "whatsapp:+34…" y el resto del sistema trabaja con el número
     a secas. Si el prefijo se colara, no emparejaría con ningún contacto. */
  const m = leerWebhookDeMensajeria(CAMPOS);
  assert.equal(m.from, "+34600111222");
  assert.equal(m.to, "+34983460825");
  assert.equal(m.canal, "whatsapp");
  assert.equal(m.text, "Hola, quería información");
});

test("distingue un SMS de un WhatsApp", () => {
  const m = leerWebhookDeMensajeria({ From: "+34600111222", To: "+34983460825", Body: "hola" });
  assert.equal(m.canal, "sms");
});

test("un aviso de estado llega sin texto", () => {
  /* Twilio manda por la misma puerta los cambios de estado de los mensajes
     que enviamos nosotros. No son mensajes de nadie. */
  const m = leerWebhookDeMensajeria({ MessageSid: "SM1", MessageStatus: "delivered" });
  assert.equal(m.text, "");
  assert.equal(m.estado, "delivered");
});

test("normalizePhone deja el número en forma canónica", () => {
  assert.equal(normalizePhone("+34 983 460 825"), "+34983460825");
  assert.equal(normalizePhone("whatsapp:+34600111222".replace("whatsapp:", "")), "+34600111222");
});
