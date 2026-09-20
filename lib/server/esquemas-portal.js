/* Esquemas de lo que el portal manda a las rutas nuevas. Todo se valida
   antes de tocar la base; lo que no tiene forma es un 400. */
import { z } from "zod";

const texto = (max) => z.string().trim().max(max);
const clave = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/, "Clave no válida");

export const Departamento = z.object({
  id: z.uuid().optional(),
  clave,
  nombre: texto(60).min(1),
  descripcion: texto(400).optional().default(""),
  palabras_clave: z.array(texto(40)).max(30).optional().default([]),
  orden: z.number().int().min(0).max(999).optional().default(0),
  activo: z.boolean().optional().default(true),
});
export const Departamentos = z.object({ departamentos: z.array(Departamento).max(40) });

export const Destinatario = z.object({
  nombre: texto(80).min(1, "Falta el nombre"),
  email: texto(254).toLowerCase().pipe(z.email("Correo no válido")),
  cargo: texto(80).optional().default(""),
  departamentos: z.array(clave).max(40).optional().default([]),
  recibe_todo: z.boolean().optional().default(false),
  activo: z.boolean().optional().default(true),
});
export const DestinatarioParcial = Destinatario.partial().extend({ id: z.uuid() });
export const BorrarDestinatario = z.object({ id: z.uuid() });

export const AutomatismoCambio = z.object({
  tipo: texto(60).min(1),
  activo: z.boolean().optional(),
  modo: z.enum(["avisar", "preparar", "solo"]).optional(),
  config: z.record(z.string(), z.union([z.string().max(254), z.number(), z.boolean()])).optional(),
});

export const ConfigIA = z.object({
  tono: texto(20).optional(),
  autonomia: z.number().int().min(1).max(4).optional(),
  puede: z.array(texto(200)).max(20).optional(),
  no_puede: z.array(texto(200)).max(20).optional(),
  derivar_cuando: z.array(texto(200)).max(20).optional(),
  preguntas: z.array(texto(200)).max(10).optional(),
  datos: z.array(texto(40)).max(12).optional(),
  horario: z.object({
    dias: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    desde: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    hasta: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }).optional(),
  mensaje_bienvenida: texto(600).optional(),
  mensaje_fuera_horario: texto(600).optional(),
  reglas_derivacion: z.array(z.object({ si: texto(200), departamento: clave })).max(20).optional(),
  instrucciones: texto(4000).optional(),
});

export const Previsualizar = z.object({
  mensaje: texto(2000).min(1, "Escribe un mensaje de prueba"),
  config: ConfigIA.optional(),
});

export const ClasificarContacto = z.object({ lead_id: z.uuid() });

export const PreguntaCopiloto = z.object({
  pregunta: texto(500).min(1, "Escribe una pregunta"),
});

export const SugerenciaConversacion = z.object({
  leadId: texto(200).min(1, "Falta leadId"),
  channel: texto(40).optional().default("whatsapp"),
  goal: texto(80).optional().default("followup"),
});

export const EnviarSms = z.object({
  leadId: texto(200).min(1, "Falta leadId"),
  to: texto(64).min(1, "Falta teléfono"),
  message: texto(1600).min(1, "Falta mensaje"),
  templateId: texto(200).nullable().optional().default(null),
});

const RolPortal = z.enum(["owner", "admin", "manager", "agent", "viewer"]);
const IdUsuarioPortal = z.uuid("Identificador de usuario no válido");

export const CrearUsuarioPortal = z.object({
  email: texto(254).toLowerCase().pipe(z.email("Correo no válido")),
  full_name: texto(200).min(1, "Falta el nombre"),
  role: RolPortal.optional().default("agent"),
  phone: texto(30).optional().default(""),
  password: z.string().max(1024).optional(),
  is_active: z.boolean().optional().default(true),
});

export const ActualizarUsuarioPortal = z.object({
  id: IdUsuarioPortal,
  full_name: texto(200).min(1).optional(),
  role: RolPortal.optional(),
  phone: texto(30).optional(),
  is_active: z.boolean().optional(),
}).refine(
  ({ id: _id, ...cambios }) => Object.values(cambios).some((valor) => valor !== undefined),
  { message: "No hay cambios que aplicar" },
);

export const RestablecerPasswordUsuario = z.object({
  userId: IdUsuarioPortal,
  password: z.string().min(1, "Falta la contraseña").max(1024),
});

export const ActualizarPermisosPortal = z.object({
  userId: IdUsuarioPortal,
  scopes: z.array(texto(80).min(1)).max(40),
});

export const ConectarDominio = z.object({
  domain: texto(253)
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Dominio inválido"),
});

export const ProbarWebhook = z.object({
  url: texto(2048).optional().default(""),
});

const CamposMarca = z.object({
  brand_name: texto(200),
  brand_logo_url: texto(2048),
  primary_color: texto(100),
  secondary_color: texto(100),
  industry: texto(200),
  webhook: texto(2048),
  tagline: texto(300),
  logo_text: texto(100),
  accent: texto(200),
  accent_text: texto(200),
  button: texto(300),
  badge: texto(300),
});

const conAlgunCampo = (entrada) =>
  Object.values(entrada).some((valor) => valor !== undefined);
const emailOVacio = texto(254).toLowerCase().refine(
  (valor) => valor === "" || z.email().safeParse(valor).success,
  "Correo no válido",
);

export const BrandingPortal = CamposMarca.omit({ webhook: true, tagline: true })
  .partial()
  .refine(conAlgunCampo, { message: "No hay cambios que aplicar" });

export const AjustesPortal = CamposMarca.partial().extend({
  weekly_report_email: emailOVacio.optional(),
  daily_report_email: emailOVacio.optional(),
  realtime_refresh_seconds: z.number().int().min(10).max(3600).optional(),
  default_deal_value: z.number().finite().min(0).max(1_000_000_000).optional(),
  monthly_target_leads: z.number().int().min(0).max(10_000_000).optional(),
  monthly_target_conversion: z.number().finite().min(0).max(100).optional(),
}).refine(conAlgunCampo, { message: "No hay cambios que aplicar" });

const RespuestaBase = {
  leadId: z.uuid("Identificador de contacto no válido"),
  requestId: z.uuid("Identificador de envío no válido"),
  takeover: z.boolean().optional().default(false),
};

export const ResponderConversacion = z.discriminatedUnion("channel", [
  z.object({
    ...RespuestaBase,
    channel: z.literal("sms"),
    message: texto(1600).min(1, "Falta el mensaje"),
    subject: texto(300).optional().default(""),
  }),
  z.object({
    ...RespuestaBase,
    channel: z.literal("whatsapp"),
    message: texto(4096).min(1, "Falta el mensaje"),
    subject: texto(300).optional().default(""),
  }),
  z.object({
    ...RespuestaBase,
    channel: z.literal("email"),
    message: texto(10000).min(1, "Falta el mensaje"),
    subject: texto(300).optional().default(""),
  }),
]);

export const CambiarModoAgente = z.object({
  agenteId: texto(60).min(1, "Falta el agente"),
  modo: z.enum(["avisar", "preparar", "solo"]),
});

export const ReintentarEntregaWebhook = z.object({
  entrega: z.uuid("Identificador de entrega no válido"),
});

const CodigoTotp = texto(6).regex(/^\d{6}$/, "Código TOTP no válido");
const CodigoTotpORecuperacion = texto(16).regex(
  /^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/,
  "Código no válido",
);

export const GestionTotp = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("confirm"), code: CodigoTotp }),
  z.object({ action: z.literal("disable"), code: CodigoTotpORecuperacion }),
]);
