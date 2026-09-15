import { productos, variantes, resultadosDeVariantes } from "@/lib/server/datos";
import { getPaidLeadRows } from "@/lib/server/payments";
import {
  buildMessageExperimentSummary,
  buildProductPerformanceSnapshot,
} from "@/lib/portal-product";

export async function getClientPaymentRows(clientId, limit = 1000) {
  const rows = await getPaidLeadRows(limit);
  return rows.filter((row) => row.client_id === clientId);
}

export async function getClientMessageExperimentSnapshot({
  clientId = null,
  leadIds = [],
  smsTemplates = [],
  whatsappTemplates = [],
} = {}) {
  const variants = await variantes({ client_id: clientId, activas: true });

  /* Los resultados se filtran por variante, que ya son de esta empresa o de
     plataforma; el filtro por contacto se aplica después, en memoria, sobre
     una lista que cabe de sobra. */
  const results =
    leadIds.length > 0
      ? (await resultadosDeVariantes(variants.map((v) => v.id), { cuantos: 1200 }))
          .filter((r) => leadIds.includes(r.lead_id))
      : [];

  return buildMessageExperimentSummary({
    variants,
    results,
    smsTemplates,
    whatsappTemplates,
  });
}

export function buildOwnerRevenueRanking({
  leads = [],
  payments = [],
  users = [],
} = {}) {
  const ownerByLeadId = new Map();
  const roleByOwner = new Map();

  (leads || []).forEach((lead) => {
    ownerByLeadId.set(lead.id, lead.owner || "Sin asignar");
  });

  (users || []).forEach((user) => {
    if (user?.full_name) {
      roleByOwner.set(user.full_name, user.role || "—");
    }
  });

  const byOwner = new Map();

  (payments || []).forEach((payment) => {
    const owner =
      ownerByLeadId.get(payment.lead_id) ||
      payment.customer_name ||
      "Sin asignar";

    if (!byOwner.has(owner)) {
      byOwner.set(owner, {
        owner,
        role: roleByOwner.get(owner) || "—",
        revenue: 0,
        paid_leads: 0,
        payments_count: 0,
        last_payment_at: null,
        _leadKeys: new Set(),
      });
    }

    const current = byOwner.get(owner);
    current.revenue += Number(payment.amount || 0);
    current.payments_count += 1;

    const leadKey = payment.lead_id || payment.phone || null;
    if (leadKey && !current._leadKeys.has(leadKey)) {
      current._leadKeys.add(leadKey);
      current.paid_leads += 1;
    }

    if (
      payment.created_at &&
      (!current.last_payment_at ||
        new Date(payment.created_at) > new Date(current.last_payment_at))
    ) {
      current.last_payment_at = payment.created_at;
    }
  });

  const ranking = [...byOwner.values()]
    .map((row) => {
      const { _leadKeys, ...cleanRow } = row;
      return {
        ...cleanRow,
        avg_ticket:
          cleanRow.payments_count > 0
            ? cleanRow.revenue / cleanRow.payments_count
            : 0,
      };
    })
    .sort((left, right) => right.revenue - left.revenue);

  return {
    totalRevenue: ranking.reduce((acc, row) => acc + row.revenue, 0),
    totalOwners: ranking.length,
    bestOwner: ranking[0] || null,
    ranking,
  };
}

export async function getClientProductPerformance({
  clientId,
  products = null,
  limit = 1000,
} = {}) {
  const paymentRows = await getClientPaymentRows(clientId, limit);
  const productRows =
    products ||
    (await productos({ activos: true }));

  return buildProductPerformanceSnapshot({
    products: productRows,
    payments: paymentRows,
  });
}
