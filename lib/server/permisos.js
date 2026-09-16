/* =========================================================================
   Qué puede hacer cada rol.

   Hasta ahora cada ruta llevaba su propia lista: `hasRole(ctx.role,
   ["owner", "admin", "manager"])`, treinta veces, con tres variantes que
   nadie había escrito en ningún sitio. Ahora la pregunta es siempre la
   misma —¿puede este rol hacer esta acción?— y la respuesta vive aquí, en
   una tabla que se lee entera de un vistazo. Cambiar quién exporta contactos
   es cambiar una línea, no buscar ocho.

   Los roles son los de siempre (`portal_users.role`): owner, admin,
   manager, agent, viewer. Tres escalones:

     owner, admin ........... la empresa: ajustes, marca, usuarios, cobro
     + manager .............. lo que sale fuera: informes, exportaciones, demos
     + agent ................ el trabajo diario: contactos, inbox, IA
     viewer ................. sólo mira

   Los nombres de las acciones son los del catálogo de permisos por usuario
   (`portal-permissions.js`: crm.edit, inbox.reply, api.manage…) más los que
   faltaban. Las casillas del catálogo sólo restringen a manager/agent y
   sólo cuando hay alguna marcada. Nunca amplían el rol ni limitan a
   owner/admin. Las acciones sin casilla conservan su política por rol.
   ========================================================================= */

import { getPermissionCatalog } from "@/lib/server/portal-permissions";

const CATALOGO = new Set(getPermissionCatalog().map(({ id }) => id));
const EMPRESA = ["owner", "admin"];
const GESTION = [...EMPRESA, "manager"];
const TRABAJO = [...GESTION, "agent"];

/** Acción → roles que pueden. La tabla entera. */
export const ACCIONES = Object.freeze({
  /* El trabajo diario. */
  "crm.edit": TRABAJO,           // editar contactos, notas, comentarios, recordatorios, memoria
  "inbox.reply": TRABAJO,        // responder y sugerir en conversaciones, SMS y WhatsApp
  "ai.use": TRABAJO,             // siguiente paso, siguiente acción
  "automations.run": TRABAJO,    // ejecutar una acción sugerida, autopiloto de WhatsApp
  "billing.checkout": TRABAJO,   // abrir un checkout (bonos); el plan lo cambia la empresa

  /* Lo que sale fuera de la empresa o cuesta dinero. */
  "crm.export": GESTION,
  "audit.export": GESTION,
  "reports.send": GESTION,       // informe diario y semanal por correo
  "voice.demo": GESTION,         // llamada de demostración
  "playbooks.manage": GESTION,
  "experiments.manage": GESTION, // variantes A/B
  "api.test": GESTION,           // probar el webhook saliente

  /* La empresa. */
  "settings.manage": EMPRESA,    // ajustes, dominio
  "brand.manage": EMPRESA,
  "agents.manage": EMPRESA,      // agentes de voz
  "api.manage": EMPRESA,         // la clave del webhook
  "users.manage": EMPRESA,       // usuarios del portal y sus permisos
  "billing.manage": EMPRESA,     // cambiar de plan, portal de Stripe

  /* La IA de la empresa. */
  "ai.configure": EMPRESA,       // tono, límites, horarios, mensajes de la IA
  "routing.manage": GESTION,     // departamentos, destinatarios y automatismos; manager SÓLO con la casilla
  "routing.view": TRABAJO,       // ver departamentos, destinatarios, automatismos y sus ejecuciones
});

/** Acciones que manager sólo puede con su casilla marcada, tenga o no
    otras: decidir a quién le llegan los contactos es demasiado para
    heredarlo del rol sin que nadie lo haya dicho. */
export const SOLO_CON_CASILLA = Object.freeze(new Set(["routing.manage"]));

/** ¿Puede este rol hacer esta acción? Una acción desconocida es que no. */
export function puede(rol, accion, permisos = []) {
  const roles = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null;
  if (!roles) {
    console.error(`[permisos] acción desconocida: ${accion}`);
    return false;
  }
  const normalizado = String(rol || "").toLowerCase();
  if (!roles.includes(normalizado)) return false;
  if (!["manager", "agent"].includes(normalizado) || !CATALOGO.has(accion)) return true;

  // Sólo cuentan casillas existentes, no valores inventados o antiguos.
  const marcados = Array.isArray(permisos) ? permisos.filter(scope => CATALOGO.has(scope)) : [];
  if (SOLO_CON_CASILLA.has(accion)) return marcados.includes(accion);
  return marcados.length === 0 || marcados.includes(accion);
}

/** Los roles que pueden hacer una acción, para enseñarlo o probarlo. */
export function rolesQuePueden(accion) {
  return [...(ACCIONES[accion] || [])];
}

/** La respuesta de siempre cuando no se puede. */
export function sinPermiso(mensaje = "Sin permisos") {
  return Response.json({ success: false, message: mensaje }, { status: 403 });
}
