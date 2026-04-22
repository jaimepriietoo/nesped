import { prisma } from "@/lib/prisma";

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function getPaidLeadRows(limit = 500) {
  const paymentEvents = await prisma.leadEvent.findMany({
    where: {
      type: "payment_completed",
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
  });

  return paymentEvents.map((event) => {
    const parsed = safeParseJson(event.message || "{}") || {};
    const amount = Number(parsed.amount_total || 0);
    const currency = parsed.currency || "eur";

    return {
      id: event.id,
      lead_id: event.lead_id || "",
      phone: event.phone || "",
      amount,
      currency,
      created_at: event.created_at,
      customer_email: parsed.customer_email || "",
      customer_name: parsed.customer_name || "",
      product_tier: parsed.product_tier || "",
      product_name: parsed.product_name || "",
      checkout_session_id: parsed.checkout_session_id || "",
      client_id: parsed.client_id || "",
      stripe_event_id: parsed.stripe_event_id || "",
    };
  });
}

export function groupPaidLeadRows(rows = []) {
  const groupedByLead = new Map();

  for (const row of rows) {
    const key = row.lead_id || row.phone || row.id;

    if (!groupedByLead.has(key)) {
      groupedByLead.set(key, {
        lead_id: row.lead_id,
        phone: row.phone,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        total_revenue: 0,
        payments_count: 0,
        last_payment_at: row.created_at,
        currency: row.currency,
        product_tier: row.product_tier || "unknown",
        product_name: row.product_name || "",
        client_id: row.client_id || "",
      });
    }

    const current = groupedByLead.get(key);
    current.total_revenue += row.amount;
    current.payments_count += 1;

    if (new Date(row.created_at) > new Date(current.last_payment_at)) {
      current.last_payment_at = row.created_at;
    }

    if (!current.customer_name && row.customer_name) {
      current.customer_name = row.customer_name;
    }

    if (!current.customer_email && row.customer_email) {
      current.customer_email = row.customer_email;
    }

    if (!current.phone && row.phone) {
      current.phone = row.phone;
    }

    if (!current.product_tier && row.product_tier) {
      current.product_tier = row.product_tier;
    }

    if (!current.product_name && row.product_name) {
      current.product_name = row.product_name;
    }
  }

  return Array.from(groupedByLead.values()).sort(
    (a, b) => b.total_revenue - a.total_revenue
  );
}
