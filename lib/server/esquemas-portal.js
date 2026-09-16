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
