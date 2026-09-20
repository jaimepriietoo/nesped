import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ContextoElevenLabs, LeadElevenLabs, LlamadaDemo, Login, MensajeTwilio,
  PostCallElevenLabs, RegistroPublico, SegundoFactor, validar,
} from "@/lib/server/esquemas";
import {
  ActualizarUsuarioPortal,
  ActualizarPermisosPortal,
  AjustesPortal,
  BrandingPortal,
  CambiarModoAgente,
  ConectarDominio,
  CrearUsuarioPortal,
  EnviarSms,
  GestionTotp,
  ProbarWebhook,
  ReintentarEntregaWebhook,
  ResponderConversacion,
  RestablecerPasswordUsuario,
} from "@/lib/server/esquemas-portal";
import {
  AccionSobreLead,
  AccionRecomendadaInterna,
  ActualizarClienteAdmin,
  ActualizarUsuarioAdmin,
  DesvioAdmin,
  EjecutarAccionRecomendada,
  InterruptoresAdmin,
  RecalcularAcciones,
  ReintentoColaAdmin,
  WhatsappInterno,
} from "@/lib/server/esquemas-operaciones";

/**
 * Lo que se acepta en la puerta. Lo que importa: que lo bueno pase con la
 * forma de siempre, que lo malo sea un 400 con un mensaje que se entienda,
 * y que los webhooks no pierdan campos que no conocemos.
 */

test("el login normaliza el correo y rechaza lo que no tiene forma", async () => {
  const ok = validar(Login, { email: "  Ana@Empresa.ES ", password: "x", next: "/portal" });
  assert.deepEqual(ok.datos, { email: "ana@empresa.es", password: "x", next: "/portal" });
  assert.equal(validar(Login, { email: "ana@empresa.es", password: "x" }).datos.next, "");

  for (const malo of [{}, { email: "ana", password: "x" }, { email: "a@b.es" }, { email: 5, password: "x" }]) {
    const r = validar(Login, malo, { mensaje: "Faltan email o contraseña" });
    assert.equal(r.respuesta?.status, 400, JSON.stringify(malo));
    assert.match((await r.respuesta.json()).message, /^Faltan email o contraseña/);
  }
});

test("el segundo factor acepta seis dígitos o un código de recuperación, y nada más", () => {
  assert.equal(validar(SegundoFactor, { code: " 123456 " }).datos.code, "123456");
  assert.equal(validar(SegundoFactor, { code: "abcde-fghij" }).datos.code, "abcde-fghij");
  assert.equal(validar(SegundoFactor, { code: "abcdefghij" }).datos.code, "abcdefghij");
  for (const malo of ["12345", "1234567", "' or 1=1", "", "a".repeat(40)]) {
    assert.equal(validar(SegundoFactor, { code: malo }).respuesta?.status, 400, malo);
  }
});

test("los webhooks comprueban la forma de lo que usan y dejan pasar el resto", () => {
  const evento = {
    type: "post_call_transcription",
    data: { conversation_id: "conv_1", transcript: [{ role: "agent", message: "hola" }], analysis: { x: 1 },
      conversation_initiation_client_data: { dynamic_variables: { client_id: "acme" }, otra_cosa: true } },
    campo_nuevo_del_proveedor: { a: 1 },
  };
  const r = validar(PostCallElevenLabs, evento);
  assert.equal(r.respuesta, undefined);
  assert.deepEqual(r.datos, evento, "no se pierde nada");
  assert.equal(validar(PostCallElevenLabs, { data: { conversation_id: 42 } }).respuesta?.status, 400);
  assert.equal(validar(PostCallElevenLabs, {}).respuesta, undefined, "un evento vacío es un evento, no un error");

  const sms = { MessageSid: "SM1", From: "whatsapp:+34600", To: "whatsapp:+34900", Body: "Hola", NumMedia: "0", ProfileName: "Ana" };
  assert.deepEqual(validar(MensajeTwilio, sms).datos, sms);
  assert.equal(validar(MensajeTwilio, { Body: "x".repeat(5000) }).respuesta?.status, 400);
});

test("las demás entradas públicas tienen forma y longitudes cerradas", () => {
  assert.equal(validar(RegistroPublico, {
    email: "persona@example.org", password: "una-clave", empresa: "Empresa", plan: "growth",
  }).respuesta, undefined);
  assert.equal(validar(RegistroPublico, {
    email: "persona@example.org", password: "una-clave", empresa: "Empresa", plan: "enterprise",
  }).respuesta?.status, 400);
  assert.equal(validar(LlamadaDemo, { telefono: "+34600111222", lead_id: "x".repeat(201) }).respuesta?.status, 400);
  assert.equal(validar(ContextoElevenLabs, { caller_id: "x".repeat(65) }).respuesta?.status, 400);
  assert.equal(validar(LeadElevenLabs, { clientId: "empresa", notes: "x".repeat(20001) }).respuesta?.status, 400);
});

test("un SMS lleva identificador, teléfono y mensaje dentro de límites", () => {
  assert.equal(validar(EnviarSms, {
    leadId: "lead-1", to: "+34600111222", message: "Hola", templateId: null,
  }).respuesta, undefined);
  assert.equal(validar(EnviarSms, {
    leadId: "lead-1", to: "+34600111222", message: "x".repeat(1601),
  }).respuesta?.status, 400);
  assert.equal(validar(EnviarSms, {
    leadId: "lead-1", to: "", message: "Hola",
  }).respuesta?.status, 400);
});

test("la gestión de usuarios sólo acepta campos, roles e identificadores acotados", () => {
  const id = "d92fe75b-e987-4439-9b48-172d7987fd41";
  assert.equal(validar(CrearUsuarioPortal, {
    email: " Nueva@Empresa.ES ", full_name: " Ana ", role: "manager", phone: "+34600",
  }).datos.email, "nueva@empresa.es");
  assert.equal(validar(CrearUsuarioPortal, {
    email: "a@example.org", full_name: "Ana", role: "super_admin",
  }).respuesta?.status, 400);
  assert.equal(validar(ActualizarUsuarioPortal, { id, role: "agent" }).respuesta, undefined);
  assert.equal(validar(ActualizarUsuarioPortal, { id }).respuesta?.status, 400);
  assert.equal(validar(ActualizarUsuarioPortal, { id: "ajeno", is_active: false }).respuesta?.status, 400);
  assert.equal(validar(RestablecerPasswordUsuario, {
    userId: id, password: "x".repeat(1025),
  }).respuesta?.status, 400);
});

test("dominios, webhooks y permisos tienen forma y tamaño cerrados", () => {
  const id = "d92fe75b-e987-4439-9b48-172d7987fd41";
  assert.equal(validar(ConectarDominio, { domain: " Portal.Empresa.ES " }).datos.domain, "portal.empresa.es");
  for (const domain of ["localhost", "https://empresa.es", "a".repeat(254)]) {
    assert.equal(validar(ConectarDominio, { domain }).respuesta?.status, 400, domain);
  }
  assert.equal(validar(ProbarWebhook, {}).datos.url, "");
  assert.equal(validar(ProbarWebhook, { url: "x".repeat(2049) }).respuesta?.status, 400);
  assert.equal(validar(ActualizarPermisosPortal, {
    userId: id, scopes: ["crm.edit", "inbox.reply"],
  }).respuesta, undefined);
  assert.equal(validar(ActualizarPermisosPortal, {
    userId: "ajeno", scopes: [],
  }).respuesta?.status, 400);
  assert.equal(validar(ActualizarPermisosPortal, {
    userId: id, scopes: Array(41).fill("crm.edit"),
  }).respuesta?.status, 400);
});

test("branding y ajustes rechazan cargas vacías, enormes o fuera de rango", () => {
  assert.equal(validar(BrandingPortal, { brand_name: " Empresa " }).datos.brand_name, "Empresa");
  assert.equal(validar(BrandingPortal, {}).respuesta?.status, 400);
  assert.equal(validar(BrandingPortal, { brand_logo_url: "x".repeat(2049) }).respuesta?.status, 400);

  assert.equal(validar(AjustesPortal, {
    daily_report_email: " avisos@empresa.es ",
    realtime_refresh_seconds: 30,
    monthly_target_conversion: 75,
  }).datos.daily_report_email, "avisos@empresa.es");
  for (const entrada of [
    {},
    { daily_report_email: "correo-invalido" },
    { realtime_refresh_seconds: 9 },
    { monthly_target_conversion: 101 },
    { default_deal_value: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(validar(AjustesPortal, entrada).respuesta?.status, 400, JSON.stringify(entrada));
  }
});

test("respuestas, agentes y reintentos sólo aceptan operaciones conocidas", () => {
  const id = "d92fe75b-e987-4439-9b48-172d7987fd41";
  const requestId = "994fd082-3472-4dc4-8b60-0f89a304e497";
  assert.equal(validar(ResponderConversacion, {
    leadId: id, requestId, channel: "sms", message: "Hola", takeover: true,
  }).respuesta, undefined);
  assert.equal(validar(ResponderConversacion, {
    leadId: id, requestId, channel: "sms", message: "x".repeat(1601),
  }).respuesta?.status, 400);
  assert.equal(validar(ResponderConversacion, {
    leadId: id, requestId, channel: "telegram", message: "Hola",
  }).respuesta?.status, 400);
  assert.equal(validar(ResponderConversacion, {
    leadId: id, channel: "sms", message: "Hola",
  }).respuesta?.status, 400, "sin clave idempotente no se envía");
  assert.equal(validar(CambiarModoAgente, {
    agenteId: "rescate", modo: "solo",
  }).respuesta, undefined);
  assert.equal(validar(CambiarModoAgente, {
    agenteId: "rescate", modo: "sin-limites",
  }).respuesta?.status, 400);
  assert.equal(validar(ReintentarEntregaWebhook, { entrega: id }).respuesta, undefined);
  assert.equal(validar(ReintentarEntregaWebhook, { entrega: "otra-empresa" }).respuesta?.status, 400);
});

test("las operaciones administrativas sólo aceptan cambios acotados", () => {
  assert.equal(validar(InterruptoresAdmin, { pausa_global: true, motivo: "incidente" }).respuesta, undefined);
  assert.equal(validar(InterruptoresAdmin, { empresa: "acme", ia_pausada: true }).respuesta, undefined);
  for (const entrada of [
    {},
    { empresa: "acme", pausa_global: true },
    { empresa: "acme", ia_pausada: true, pausa_ia: true },
    { ia_pausada: true },
  ]) {
    assert.equal(validar(InterruptoresAdmin, entrada).respuesta?.status, 400, JSON.stringify(entrada));
  }

  assert.equal(validar(DesvioAdmin, { empresa: "acme", activar: false }).respuesta, undefined);
  assert.equal(validar(DesvioAdmin, { empresa: "acme", activar: "sí" }).respuesta?.status, 400);
  assert.equal(validar(ReintentoColaAdmin, { trabajo: "42" }).datos.trabajo, 42);
  assert.equal(validar(ReintentoColaAdmin, { trabajo: -1 }).respuesta?.status, 400);
  assert.equal(validar(ReintentoColaAdmin, {}).respuesta?.status, 400);

  assert.equal(validar(ActualizarUsuarioAdmin, { id: "usuario-1", role: "manager" }).respuesta, undefined);
  assert.equal(validar(ActualizarUsuarioAdmin, { id: "usuario-1", role: "super_admin" }).respuesta?.status, 400);
  assert.equal(validar(ActualizarUsuarioAdmin, { id: "usuario-1" }).respuesta?.status, 400);
  assert.deepEqual(
    validar(ActualizarClienteAdmin, { id: "empresa-1", name: "Nuevo nombre" }).datos,
    { id: "empresa-1", name: "Nuevo nombre" },
    "una actualización parcial no rellena ni pisa los demás campos",
  );
});

test("las acciones sobre contactos y el envío interno tienen límites", () => {
  assert.equal(validar(AccionSobreLead, { leadId: "lead-1", brandName: "Equipo" }).respuesta, undefined);
  assert.equal(validar(AccionSobreLead, { leadId: "x".repeat(201) }).respuesta?.status, 400);
  assert.equal(validar(WhatsappInterno, { to: "+34600111222", message: "Hola" }).respuesta, undefined);
  assert.equal(validar(WhatsappInterno, { to: "+34600111222", message: "x".repeat(4097) }).respuesta?.status, 400);

  assert.equal(validar(AccionRecomendadaInterna, {
    leadId: "lead-1", clientId: "empresa-1", useAI: true,
  }).respuesta, undefined);
  assert.equal(validar(AccionRecomendadaInterna, {
    leadId: "x".repeat(201), clientId: "empresa-1",
  }).respuesta?.status, 400);
  assert.equal(validar(EjecutarAccionRecomendada, {
    leadId: "lead-1", clientId: "empresa-1", actor: "system",
  }).respuesta, undefined);
  assert.equal(validar(EjecutarAccionRecomendada, {
    leadId: "lead-1",
  }).respuesta?.status, 400);
  assert.equal(validar(RecalcularAcciones, {}).respuesta, undefined);
  assert.equal(validar(RecalcularAcciones, { clientId: "x".repeat(201) }).respuesta?.status, 400);
});

test("la gestión TOTP sólo acepta sus tres operaciones y códigos válidos", () => {
  assert.equal(validar(GestionTotp, { action: "start" }).respuesta, undefined);
  assert.equal(validar(GestionTotp, { action: "confirm", code: "123456" }).respuesta, undefined);
  assert.equal(validar(GestionTotp, { action: "disable", code: "ABCDE-FGHJK" }).respuesta, undefined);
  for (const entrada of [
    { action: "confirm", code: "12345" },
    { action: "disable", code: "clave" },
    { action: "bypass", code: "123456" },
  ]) assert.equal(validar(GestionTotp, entrada).respuesta?.status, 400);
});
