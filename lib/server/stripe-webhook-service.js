import { prisma } from "@/lib/prisma";
import { getSupabase } from "@/lib/supabase";

function normalizePhone(phone = "") {
  return String(phone).replace(/[^\d+]/g, "").trim();
}


function centsToAmount(value) {
  return typeof value === "number" ? value / 100 : 0;
}

async function createPaymentEvent({
  leadId,
  phone,
  eventId,
  session,
  amountTotal,
  currency,
  customerEmail,
  customerName,
  productTier,
  productName,
}) {
  /* La comprobación de duplicados vive ahora en reclamar_webhook(), arriba
     del todo: si se llega hasta aquí es que el evento es nuevo. Recorrer 200
     filas para averiguar lo mismo, y peor, sobra. */

  return prisma.leadEvent.create({
    data: {
      lead_id: leadId || null,
      phone: phone || null,
      type: "payment_completed",
      message: JSON.stringify({
        stripe_event_id: eventId,
        checkout_session_id: session.id,
        payment_status: session.payment_status,
        amount_total: amountTotal,
        currency,
        customer_email: customerEmail,
        customer_name: customerName,
        product_tier: productTier,
        product_name: productName,
        client_id: session.metadata?.client_id || "",
        lead_id: leadId || "",
      }),
    },
  });
}

async function updateLeadAfterPayment({
  supabase,
  leadId,
  clientId,
  amountTotal,
  currency,
}) {
  if (!leadId || !clientId) return;

  const updatePayload = {
    status: "won",
    next_action: "wait",
    next_action_priority: "none",
    next_action_reason: "Pago completado en Stripe.",
    proxima_accion: "Cliente ya pagó. Pasar a onboarding o entrega.",
    ultima_accion: `Pago completado en Stripe (${amountTotal || 0} ${currency || ""})`,
    last_contact_at: new Date().toISOString(),
    last_contacted_at: new Date().toISOString(),
  };

  await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("client_id", clientId);

  await supabase.from("audit_logs").insert({
    client_id: clientId,
    entity_type: "lead",
    entity_id: leadId,
    action: "payment_completed",
    actor: "stripe_webhook",
    changes: updatePayload,
  });

  await prisma.leadMemory.upsert({
    where: { lead_id: leadId },
    update: {
      payment_sent: true,
      last_summary: "Pago completado en Stripe.",
    },
    create: {
      lead_id: leadId,
      payment_sent: true,
      last_summary: "Pago completado en Stripe.",
    },
  });
}

async function updateClientStripeCustomer({ supabase, clientId, customerId }) {
  if (!clientId || !customerId) return;

  await supabase
    .from("clients")
    .update({
      stripe_customer_id: customerId,
    })
    .eq("id", clientId);
}

/**
 * Guarda la suscripción de Stripe.
 *
 * Vivía en Prisma contra un SQLite en fichero que no se despliega, así que
 * esto no se guardaba en ningún sitio: la tabla ni siquiera existía en
 * Postgres. Ahora va donde va todo lo demás.
 *
 * El upsert se apoya en que stripe_subscription_id es único: si Stripe
 * reintenta el mismo evento, se actualiza la misma fila en vez de duplicarla.
 */
async function upsertSubscriptionFromStripe(supabase, subscription) {
  if (!subscription?.id) return;

  await supabase.from("subscriptions").upsert(
    {
      client_id: subscription.metadata?.client_id || null,
      stripe_subscription_id: subscription.id,
      status: subscription.status || "unknown",
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
}

/** Igual que la anterior, y por el mismo motivo. */
async function upsertInvoiceFromStripe(supabase, invoice) {
  if (!invoice?.id) return;

  const clientId =
    invoice.parent?.subscription_details?.metadata?.client_id ||
    invoice.subscription_details?.metadata?.client_id ||
    invoice.metadata?.client_id ||
    null;

  await supabase.from("invoices").upsert(
    {
      client_id: clientId,
      stripe_invoice_id: invoice.id,
      amount: centsToAmount(invoice.amount_paid ?? invoice.amount_due ?? 0),
      currency: invoice.currency || "eur",
      status: invoice.status || "unknown",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_invoice_id" }
  );
}

/**
 * Ejecuta algo accesorio sin dejar que tumbe el webhook.
 *
 * Un webhook de pago tiene una obligación por encima de las demás: que quien
 * ha pagado tenga su servicio. Todo lo que venga después —historial, métricas,
 * memoria del lead— es deseable, no imprescindible, y no puede provocar que
 * Stripe reciba un 500 sobre una operación que ya se aplicó.
 */
async function sinTumbarElPago(que, hacer) {
  try {
    await hacer();
  } catch (error) {
    console.error(`Webhook de Stripe: falló ${que}, el pago sí se aplicó.`, error?.message || error);
  }
}

export async function processStripeWebhookEvent(event) {
  const supabase = getSupabase();

  /* Un evento sólo se aplica una vez.
  
     Antes esto se resolvía recorriendo los 200 eventos de pago más recientes
     y buscando el identificador. Con volumen deja de funcionar: un reintento
     tardío de Stripe cae fuera de esa ventana y el cobro se registra dos
     veces. Y hay una carrera además: dos reintentos simultáneos podían
     recorrer la lista a la vez, no encontrarse el uno al otro y pasar los dos.
  
     Una clave primaria compuesta no tiene ventana ni carrera: o el evento
     está, o no está, y si dos llegan a la vez sólo uno consigue insertar.
  
     Si la reclamación falla —la base de datos no responde— se sigue adelante:
     procesar dos veces es malo, pero no procesar un pago es peor, y todo lo
     de abajo ya usa upsert por identificador de Stripe. */
  if (event?.id) {
    const { data: primeraVez, error } = await supabase.rpc("reclamar_webhook", {
      p_proveedor: "stripe",
      p_evento_id: event.id,
    });

    if (!error && primeraVez === false) {
      console.log(`Webhook de Stripe ${event.id} ya estaba aplicado; se ignora.`);
      return;
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const clientId = session.metadata?.client_id || null;
    /* client_reference_id sólo vale como lead cuando no venimos del alta con
       cuenta: ahí ese campo lleva el client_id, y tomarlo por un lead metía
       un identificador de empresa en el historial de un lead inexistente. */
    const leadId =
      session.metadata?.lead_id ||
      (clientId ? null : session.client_reference_id) ||
      null;
    const phone = normalizePhone(
      session.metadata?.phone || session.customer_details?.phone || ""
    );
    const amountTotal = centsToAmount(session.amount_total);
    const currency = session.currency || "";
    const customerEmail = session.customer_details?.email || "";
    const customerName = session.customer_details?.name || "";
    const productTier = session.metadata?.product_tier || "";
    const productName = session.metadata?.product_name || "";

    /* ORDEN: primero lo que le da al cliente lo que ha pagado.
    
       Antes esto empezaba por createPaymentEvent(), que escribe en Prisma. Si
       Prisma falla —y hoy falla en producción, porque apunta a un SQLite que
       no se despliega— la excepción sube y el webhook devuelve 500 ANTES de
       activar el plan. Resultado: se cobra el dinero y la cuenta se queda en
       "pendiente" para siempre.
    
       Stripe reintenta un 500, pero cada reintento vuelve a morir en la misma
       línea, así que reintentar no arregla nada.
    
       Ahora el plan se activa primero, y todo lo accesorio va detrás y no
       puede tumbar lo esencial. */
    await updateClientStripeCustomer({
      supabase,
      clientId,
      customerId:
        typeof session.customer === "string" ? session.customer : null,
    });

    await activarPlanPagado({ supabase, session });

    /* Lo de abajo es historial y análisis: útil, pero nada de esto justifica
       dejar sin servicio a alguien que acaba de pagar. Cada bloque cae por su
       cuenta y se registra; el webhook sigue devolviendo 200 para que Stripe
       no reintente una operación que ya surtió efecto. */
    await sinTumbarElPago("registro del pago", () =>
      createPaymentEvent({
        leadId,
        phone,
        eventId: event.id,
        session,
        amountTotal,
        currency,
        customerEmail,
        customerName,
        productTier,
        productName,
      })
    );

    await sinTumbarElPago("actualización del lead", () =>
      updateLeadAfterPayment({
        supabase,
        leadId,
        clientId,
        amountTotal,
        currency,
      })
    );

    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    /* Igual que arriba: el estado de la cuenta primero, el historial después. */
    await sincronizarSuscripcion({ supabase, subscription: event.data.object });
    await sinTumbarElPago("histórico de suscripción", () =>
      upsertSubscriptionFromStripe(supabase, event.data.object)
    );
    return;
  }

  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.finalized"
  ) {
    await sinTumbarElPago("histórico de facturas", () =>
      upsertInvoiceFromStripe(supabase, event.data.object)
    );
  }
}
