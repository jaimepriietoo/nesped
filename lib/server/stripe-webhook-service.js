import { prisma } from "@/lib/prisma";
import { getSupabase } from "@/lib/supabase";

function normalizePhone(phone = "") {
  return String(phone).replace(/[^\d+]/g, "").trim();
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function centsToAmount(value) {
  return typeof value === "number" ? value / 100 : 0;
}

async function findExistingPaymentEvent({ eventId, sessionId }) {
  const candidates = await prisma.leadEvent.findMany({
    where: {
      type: "payment_completed",
    },
    orderBy: {
      created_at: "desc",
    },
    take: 200,
  });

  return candidates.find((item) => {
    const parsed = safeParseJson(item.message || "{}") || {};
    return (
      parsed.stripe_event_id === eventId ||
      parsed.checkout_session_id === sessionId
    );
  });
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
  const existing = await findExistingPaymentEvent({
    eventId,
    sessionId: session.id,
  });

  if (existing) return existing;

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

async function upsertSubscriptionFromStripe(subscription) {
  if (!subscription?.id) return;

  await prisma.subscription.upsert({
    where: {
      stripe_subscription_id: subscription.id,
    },
    update: {
      client_id: subscription.metadata?.client_id || null,
      status: subscription.status || "unknown",
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    },
    create: {
      client_id: subscription.metadata?.client_id || null,
      stripe_subscription_id: subscription.id,
      status: subscription.status || "unknown",
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    },
  });
}

async function upsertInvoiceFromStripe(invoice) {
  if (!invoice?.id) return;

  await prisma.invoice.upsert({
    where: {
      stripe_invoice_id: invoice.id,
    },
    update: {
      client_id:
        invoice.parent?.subscription_details?.metadata?.client_id ||
        invoice.subscription_details?.metadata?.client_id ||
        invoice.metadata?.client_id ||
        null,
      amount: centsToAmount(invoice.amount_paid ?? invoice.amount_due ?? 0),
      status: invoice.status || "unknown",
    },
    create: {
      client_id:
        invoice.parent?.subscription_details?.metadata?.client_id ||
        invoice.subscription_details?.metadata?.client_id ||
        invoice.metadata?.client_id ||
        null,
      stripe_invoice_id: invoice.id,
      amount: centsToAmount(invoice.amount_paid ?? invoice.amount_due ?? 0),
      status: invoice.status || "unknown",
    },
  });
}

export async function processStripeWebhookEvent(event) {
  const supabase = getSupabase();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const leadId =
      session.metadata?.lead_id ||
      session.client_reference_id ||
      null;
    const clientId = session.metadata?.client_id || null;
    const phone = normalizePhone(
      session.metadata?.phone || session.customer_details?.phone || ""
    );
    const amountTotal = centsToAmount(session.amount_total);
    const currency = session.currency || "";
    const customerEmail = session.customer_details?.email || "";
    const customerName = session.customer_details?.name || "";
    const productTier = session.metadata?.product_tier || "";
    const productName = session.metadata?.product_name || "";

    await createPaymentEvent({
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
    });

    await updateClientStripeCustomer({
      supabase,
      clientId,
      customerId:
        typeof session.customer === "string" ? session.customer : null,
    });

    await updateLeadAfterPayment({
      supabase,
      leadId,
      clientId,
      amountTotal,
      currency,
    });

    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await upsertSubscriptionFromStripe(event.data.object);
    return;
  }

  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.finalized"
  ) {
    await upsertInvoiceFromStripe(event.data.object);
  }
}
