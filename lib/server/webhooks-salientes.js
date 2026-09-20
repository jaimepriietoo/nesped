/* =========================================================================
   Webhooks salientes: lo que Nesped le cuenta a los sistemas del cliente.

   Codex dejó la firma (webhook-signing.js) y el botón de prueba; faltaba
   el que los manda. Cuando pasa algo que al cliente le interesa —una
   llamada atendida, un contacto que cambia— y la empresa tiene una URL en
   `clients.webhook`, se apunta una entrega y la cola la manda, firmada,
   con reintentos y espera creciente. Cada entrega queda con su código de
   respuesta y su error: el cliente puede ver por qué no le llegó y pedir
   que se reintente.

   Reglas:
   - Firma HMAC por empresa (`X-Nesped-Signature: t=…,v1=…`), la misma del
     botón de prueba: quien ya la verifica no cambia nada.
   - La URL se comprueba en cada envío (url-segura.js): apuntar a localhost
     o a la red interna no sale nunca de aquí.
   - El cuerpo lleva lo que hace falta para actuar y nada más: ids, estado,
     resumen. La transcripción entera no viaja: si la quieren, la piden.
   - Un 2xx es entregado; un 4xx que no sea 408/429 es 'muerto' sin
     reintentar (la URL está mal o nos rechazan); lo demás se reintenta y
     tras cinco intentos queda 'fallido'.
   ========================================================================= */

import { logErrorSeguro } from "@/lib/server/observability.mjs";

import { getSupabase } from "@/lib/supabase";
import { encolar, SinArreglo } from "@/lib/server/cola";
import { comprobarUrlExterna, peticionExternaSegura } from "@/lib/server/url-segura";
import { signWebhook } from "@/lib/server/webhook-signing";

/** Los eventos que existen, para que el nombre no se invente en cada sitio. */
export const EVENTOS = Object.freeze({
  LLAMADA_TERMINADA: "nesped.llamada.terminada",
  CONTACTO_ACTUALIZADO: "nesped.contacto.actualizado",
  PRUEBA: "nesped.webhook_test",
});

/**
 * Apunta una entrega y la encola. No manda nada: eso lo hace la cola.
 * Si la empresa no tiene webhook, no hace nada y devuelve null.
 * Nunca lanza: avisar fuera no puede tumbar lo que pasó dentro.
 */
export async function emitirWebhook({ clientId, evento, datos = {} }) {
  if (!clientId || !evento) return null;
  const supabase = getSupabase();
  try {
    const { data: empresa } = await supabase.from("clients").select("webhook, brand_name, name").eq("id", clientId).maybeSingle();
    const url = String(empresa?.webhook || "").trim();
    if (!url) return null;

    const payload = {
      event: evento,
      created_at: new Date().toISOString(),
      client_id: clientId,
      client_name: empresa?.brand_name || empresa?.name || clientId,
      data: datos,
    };
    const { data: entrega, error } = await supabase.from("webhook_entregas")
      .insert({ client_id: clientId, evento, url, payload })
      .select("id").single();
    if (error) throw new Error(error.message);

    const trabajo = await encolar({
      tipo: "webhook_saliente",
      clientId,
      datos: { entrega_id: entrega.id },
      clave: `webhook_saliente:${entrega.id}`,
      unaSolaVez: true,
    });
    await supabase.from("webhook_entregas").update({ trabajo_id: trabajo?.id || null }).eq("id", entrega.id);
    return entrega.id;
  } catch (err) {
    logErrorSeguro("outgoing_webhook.delivery_write_failed", err);
    return null;
  }
}

/** Manda una entrega. Lo llama la cola; lanza para que ella reintente. */
export async function entregarWebhook(entregaId) {
  const supabase = getSupabase();
  const { data: entrega, error } = await supabase.from("webhook_entregas").select("*").eq("id", entregaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!entrega) throw new SinArreglo(`La entrega ${entregaId} no existe`);
  if (entrega.estado === "entregado") return { yaEntregado: true };

  const intentos = (entrega.intentos || 0) + 1;
  const marcar = (cambios) => supabase.from("webhook_entregas").update({ intentos, ...cambios }).eq("id", entregaId);

  const revision = await comprobarUrlExterna(entrega.url);
  if (!revision.ok) {
    await marcar({ estado: "muerto", ultimo_error: revision.motivo });
    throw new SinArreglo(revision.motivo);
  }

  const cuerpo = JSON.stringify(entrega.payload);
  let respuesta;
  try {
    respuesta = await peticionExternaSegura(entrega.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nesped-Event": entrega.evento,
        "X-Nesped-Delivery": entrega.id,
        ...signWebhook(entrega.client_id, cuerpo),
      },
      body: cuerpo,
    });
  } catch (err) {
    await marcar({ estado: "fallido", ultimo_error: String(err?.message || err).slice(0, 500) });
    throw err;
  }

  const texto = await respuesta.text().catch(() => "");
  const codigo = Number(respuesta.status || 0);
  const resumen = { codigo_http: codigo, respuesta: String(texto || "").slice(0, 500) };

  if (codigo >= 200 && codigo < 300) {
    await marcar({ ...resumen, estado: "entregado", entregado_en: new Date().toISOString(), ultimo_error: null });
    return { entregado: true, codigo };
  }
  const definitivo = codigo >= 400 && codigo < 500 && codigo !== 408 && codigo !== 429;
  await marcar({ ...resumen, estado: definitivo ? "muerto" : "fallido", ultimo_error: `HTTP ${codigo}` });
  if (definitivo) throw new SinArreglo(`El destino contestó ${codigo}`);
  throw new Error(`El destino contestó ${codigo}`);
}

/** Vuelve a encolar una entrega fallida o muerta. Desde el portal. */
export async function reintentarEntrega(entregaId, clientId) {
  const supabase = getSupabase();
  const { data: entrega } = await supabase.from("webhook_entregas")
    .select("id, estado").eq("id", entregaId).eq("client_id", clientId).maybeSingle();
  if (!entrega) throw new Error("La entrega no existe");
  if (entrega.estado === "entregado") return { reintentado: false, motivo: "ya entregada" };
  await supabase.from("webhook_entregas").update({ estado: "pendiente", ultimo_error: null }).eq("id", entregaId);
  const trabajo = await encolar({
    tipo: "webhook_saliente",
    clientId,
    datos: { entrega_id: entregaId, reintento: true },
    clave: `webhook_saliente:${entregaId}`,
    unaSolaVez: true,
  });
  return { reintentado: true, trabajo: trabajo?.id || null };
}
