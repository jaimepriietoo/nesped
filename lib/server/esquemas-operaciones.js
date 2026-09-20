import { z } from "zod";

const texto = (max) => z.string().trim().max(max);
const conAlgunCampo = (entrada, ignorados = []) => Object.entries(entrada)
  .some(([campo, valor]) => !ignorados.includes(campo) && valor !== undefined);

export const AccionSobreLead = z.object({
  leadId: texto(200).min(1, "Falta leadId"),
  brandName: texto(200).optional(),
});

export const WhatsappInterno = z.object({
  to: texto(64).min(1, "Falta el destinatario"),
  message: texto(4096).min(1, "Falta el mensaje"),
});

export const InterruptoresAdmin = z.object({
  empresa: texto(200).optional(),
  pausa_global: z.boolean().optional(),
  pausa_ia: z.boolean().optional(),
  pausa_llamadas: z.boolean().optional(),
  ia_pausada: z.boolean().optional(),
  llamadas_pausadas: z.boolean().optional(),
  motivo: texto(300).optional(),
}).superRefine((entrada, ctx) => {
  const camposEmpresa = entrada.ia_pausada !== undefined || entrada.llamadas_pausadas !== undefined;
  const camposPlataforma = conAlgunCampo(entrada, ["empresa", "ia_pausada", "llamadas_pausadas"]);

  if (entrada.empresa) {
    if (!camposEmpresa || camposPlataforma) {
      ctx.addIssue({ code: "custom", message: "Cambio de empresa no válido" });
    }
    return;
  }

  if (!camposPlataforma || camposEmpresa) {
    ctx.addIssue({ code: "custom", message: "Cambio de plataforma no válido" });
  }
});

export const DesvioAdmin = z.object({
  empresa: texto(200).min(1, "Falta la empresa"),
  activar: z.boolean(),
  telefono: texto(64).nullable().optional(),
});

export const ReintentoColaAdmin = z.union([
  z.object({ webhook: texto(200).min(1, "Webhook no válido") }),
  z.object({ trabajo: z.coerce.number().int().positive("Trabajo no válido") }),
]);

const RolPortal = z.enum(["owner", "admin", "manager", "agent", "viewer"]);

export const ActualizarUsuarioAdmin = z.object({
  id: texto(200).min(1, "Falta id"),
  full_name: texto(200).min(1).optional(),
  email: texto(254).toLowerCase().pipe(z.email("Correo no válido")).optional(),
  role: RolPortal.optional(),
  phone: texto(30).optional(),
  is_active: z.boolean().optional(),
}).refine((entrada) => conAlgunCampo(entrada, ["id"]), {
  message: "No hay cambios que aplicar",
});

const IdLead = texto(200).min(1, "Falta el contacto");
const opcionalONulo = (esquema) => esquema.nullable().optional();

export const TextoDeLead = z.object({
  lead_id: IdLead,
  body: texto(10_000).min(1, "Falta el texto"),
});

export const RecordatorioDeLead = z.object({
  lead_id: IdLead,
  title: texto(500).min(1, "Falta el recordatorio"),
  remind_at: texto(64).refine((valor) => Number.isFinite(Date.parse(valor)), "Fecha no válida"),
  assigned_to: opcionalONulo(texto(200)),
});

export const MemoriaDeLead = z.object({
  lead_id: IdLead,
  last_intent: texto(2000).optional(),
  last_objection: texto(2000).optional(),
  temperature: texto(2000).optional(),
  recommended_product: texto(2000).optional(),
  last_summary: texto(2000).optional(),
}).refine((entrada) => conAlgunCampo(entrada, ["lead_id"]), {
  message: "No hay memoria que guardar",
});

const emailOVacio = texto(254).toLowerCase().refine(
  (valor) => valor === "" || z.email().safeParse(valor).success,
  "Correo no válido",
);

export const ActualizarLead = z.object({
  leadId: IdLead,
  status: opcionalONulo(texto(100)),
  owner: opcionalONulo(texto(200)),
  valor_estimado: opcionalONulo(z.number().finite().min(0).max(1_000_000_000)),
  lost_reason: opcionalONulo(texto(500)),
  nombre: opcionalONulo(texto(300)),
  telefono: opcionalONulo(texto(64)),
  email: opcionalONulo(emailOVacio),
  ciudad: opcionalONulo(texto(300)),
  necesidad: opcionalONulo(texto(4000)),
  notes: opcionalONulo(texto(20_000)),
  interes: opcionalONulo(texto(100)),
  next_action: opcionalONulo(texto(2000)),
  next_action_priority: opcionalONulo(texto(100)),
  proxima_accion: opcionalONulo(texto(2000)),
  ultima_accion: opcionalONulo(texto(2000)),
  tags: opcionalONulo(z.array(texto(80)).max(50)),
}).refine((entrada) => conAlgunCampo(entrada, ["leadId"]), {
  message: "Nada que actualizar",
});

const CampoPlaybook = texto(10_000).optional().default("");
export const GuardarPlaybook = z.object({
  workspace: z.object({
    tone: CampoPlaybook,
    opening: CampoPlaybook,
    qualification: CampoPlaybook,
    objections: CampoPlaybook,
    closing: CampoPlaybook,
    followup: CampoPlaybook,
    upsell: CampoPlaybook,
    handoff: CampoPlaybook,
    notes: CampoPlaybook,
  }),
});

export const CrearVarianteMensaje = z.object({
  name: texto(200).min(1, "Falta el nombre"),
  channel: texto(40).min(1).optional().default("whatsapp"),
  stage: texto(100).min(1).optional().default("qualified"),
  content: texto(10_000).min(1, "Falta el contenido"),
  active: z.boolean().optional().default(true),
});

export const CheckoutStripe = z.object({
  leadId: IdLead.optional(),
  plan: texto(60).optional().default("pro"),
  productId: opcionalONulo(texto(200)),
  phone: texto(64).optional().default(""),
  email: emailOVacio.optional().default(""),
  name: texto(300).optional().default(""),
});

export const CorreoOnboarding = z.object({
  email: texto(254).toLowerCase().pipe(z.email("Correo no válido")),
  clientName: texto(300).min(1, "Falta la empresa"),
});

const IdCliente = texto(200).min(1, "Falta el identificador de empresa");
const TelefonoAdmin = texto(64);

export const ClienteAdmin = z.object({
  id: IdCliente,
  name: texto(300).min(1, "Falta el nombre"),
  prompt: texto(40_000).optional(),
  email: emailOVacio.optional(),
  type: texto(100).optional(),
  status: texto(100).optional(),
  tagline: texto(500).optional(),
  logoText: texto(100).optional(),
  logo_text: texto(100).optional(),
  webhook: texto(2048).optional(),
  twilioNumber: TelefonoAdmin.optional(),
  twilio_number: TelefonoAdmin.optional(),
  original_number: TelefonoAdmin.optional(),
  owner_email: emailOVacio.optional(),
  brand_name: texto(300).optional(),
  brand_logo_url: texto(2048).optional(),
  primary_color: texto(100).optional(),
  secondary_color: texto(100).optional(),
  industry: texto(300).optional(),
  is_active: z.boolean().optional(),
});

export const ActualizarClienteAdmin = ClienteAdmin.partial().extend({ id: IdCliente })
  .refine((entrada) => conAlgunCampo(entrada, ["id"]), { message: "No hay cambios que aplicar" });

export const CrearUsuarioAdmin = z.object({
  email: texto(254).toLowerCase().pipe(z.email("Correo no válido")),
  password: z.string().min(1, "Falta la contraseña").max(1024),
  role: z.enum(["client", "admin", "super_admin"]).optional().default("client"),
  clientId: IdCliente,
});

export const AccionRecomendadaInterna = z.object({
  leadId: IdLead,
  clientId: IdCliente.optional(),
  brandName: texto(300).optional().default("nuestro equipo"),
  useAI: z.boolean().optional().default(true),
  actor: texto(200).optional().default("system"),
});

export const EjecutarAccionRecomendada = z.object({
  leadId: IdLead,
  clientId: IdCliente,
  actor: texto(200).optional().default("system"),
});

export const RecalcularAcciones = z.object({
  clientId: IdCliente.optional(),
});
