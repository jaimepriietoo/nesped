import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalContext } from "@/lib/portal-auth";
import { getPaidLeadRows, groupPaidLeadRows } from "@/lib/server/billing-analytics";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [subscriptions, invoices, rows] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          client_id: ctx.clientId,
        },
        orderBy: {
          created_at: "desc",
        },
        take: 20,
      }),
      prisma.invoice.findMany({
        where: {
          client_id: ctx.clientId,
        },
        orderBy: {
          created_at: "desc",
        },
        take: 50,
      }),
      getPaidLeadRows(500),
    ]);

    const filteredRows = rows.filter((row) => row.client_id === ctx.clientId);
    const topLeads = groupPaidLeadRows(filteredRows);
    const totalRevenue = topLeads.reduce(
      (acc, row) => acc + Number(row.total_revenue || 0),
      0
    );
    const paidInvoices = invoices.filter((item) => item.status === "paid");
    const activeSubscription =
      subscriptions.find((item) => item.status === "active") || null;

    return NextResponse.json({
      success: true,
      data: {
        totalRevenue,
        totalPayments: filteredRows.length,
        paidLeads: topLeads.length,
        activeSubscription,
        subscriptions,
        invoices,
        paidInvoicesCount: paidInvoices.length,
        pendingInvoicesCount: invoices.filter((item) => item.status !== "paid").length,
        lastInvoice: invoices[0] || null,
        topLeads: topLeads.slice(0, 10),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        message: "Error obteniendo información de facturación",
      },
      { status: 500 }
    );
  }
}
