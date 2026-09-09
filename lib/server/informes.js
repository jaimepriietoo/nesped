import { getResend } from "@/lib/resend";
import { SinArreglo } from "@/lib/server/cola";
import { getSupabase } from "@/lib/supabase";
import { remitenteNesped } from "@/lib/server/remitente.mjs";

/**
 * Los informes por correo.
 *
 * Vivían dentro de sus rutas, y eso traía tres problemas a la vez:
 *
 *  · Contaban en JavaScript. Se traían la cartera entera de la empresa a
 *    memoria para sacar cuatro cifras.
 *  · Se enviaban durante la petición. Quien pulsaba el botón esperaba a que
 *    Resend contestara, y si Vercel cortaba la función antes, el informe se
 *    perdía sin reintento y sin rastro.
 *  · Metían el nombre de la marca en el HTML tal cual. Lo escribe el propio
 *    cliente en sus ajustes, así que no es un ataque de nadie de fuera, pero
 *    un nombre con un `<` de más rompe el correo, y en un correo un `<script>`
 *    no es teórico: hay clientes que ejecutan cosas.
 *
 * Ahora las cifras las cuenta Postgres, el envío lo hace la cola, y el texto
 * se escapa.
 */

/** Los caracteres que cambian el significado del HTML. */
function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const euros = (n) => `${Number(n || 0).toFixed(0)}€`;

const PIE =
  '<hr /><p style="color:#888;font-size:12px">Generado automáticamente por NESPED IA</p>';

/** Qué informes existen y qué ventana mira cada uno. */
export const INFORMES = {
  diario: { titulo: "Informe diario", dias: 1, asunto: "📊 Informe diario" },
  semanal: { titulo: "Informe semanal", dias: 7, asunto: "📈 Informe semanal" },
};

function cuerpoDiario(marca, r) {
  return `
    <h2>Informe diario — ${escapar(marca)}</h2>
    <p><strong>Total de contactos:</strong> ${r.total}</p>
    <p><strong>Contactos calientes (80+):</strong> ${r.calientes}</p>
    <p><strong>Ganados:</strong> ${r.ganados}</p>
    <p><strong>En marcha:</strong> ${euros(r.pipeline)}</p>
    ${PIE}`;
}

function cuerpoSemanal(marca, r) {
  return `
    <h2>Informe semanal — ${escapar(marca)}</h2>
    <p><strong>Total de contactos:</strong> ${r.total}</p>
    <p><strong>Nuevos esta semana:</strong> ${r.nuevosPeriodo}</p>
    <p><strong>Ganados esta semana:</strong> ${r.ganadosPeriodo}</p>
    <p><strong>En marcha:</strong> ${euros(r.pipeline)}</p>
    ${PIE}`;
}

/**
 * Prepara y manda un informe. Lo llama el trabajador de la cola.
 *
 * @param tipo      "diario" o "semanal".
 * @param clientId  De qué empresa.
 * @param paraSiNoHay  A quién escribir si la empresa no tiene correo de
 *   contacto guardado: normalmente quien pidió el informe.
 */
export async function enviarInforme({ tipo, clientId, paraSiNoHay = null }) {
  const informe = INFORMES[tipo];
  if (!informe) throw new Error(`Informe desconocido: ${tipo}`);

  const supabase = getSupabase();
  const desde = new Date(Date.now() - informe.dias * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: cliente, error: errorCliente }, { data: resumen, error: errorResumen }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("brand_name,name,owner_email")
        .eq("id", clientId)
        .maybeSingle(),
      supabase.rpc("resumen_de_informe", { p_client_id: clientId, p_desde: desde }),
    ]);

  if (errorCliente) throw new Error(errorCliente.message || "No se pudo leer la empresa");
  if (errorResumen) throw new Error(errorResumen.message || "No se pudo calcular el informe");

  /* La empresa se dio de baja entre que se pidió el informe y que le tocó el
     turno. No hay nada que reintentar. */
  if (!cliente) throw new SinArreglo(`La empresa ${clientId} ya no existe`);

  const destino = cliente?.owner_email || paraSiNoHay;
  if (!destino) {
    /* Sin destinatario no hay nada que reintentar: fallará igual las cinco
       veces. Se dice claro para que se vea en la cola qué falta. */
    throw new SinArreglo("La empresa no tiene correo de contacto y no se indicó otro");
  }

  const marca = cliente?.brand_name || cliente?.name || "Portal";
  const cuerpo = tipo === "semanal" ? cuerpoSemanal(marca, resumen) : cuerpoDiario(marca, resumen);

  await getResend().emails.send({
    from: remitenteNesped(),
    to: destino,
    subject: `${informe.asunto} — ${new Date().toLocaleDateString("es-ES")}`,
    html: cuerpo,
  });

  return { destino, total: resumen?.total ?? 0 };
}

export const PARA_PRUEBAS = { escapar, cuerpoDiario, cuerpoSemanal };
