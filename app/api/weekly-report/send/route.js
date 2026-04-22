import { getResend } from "@/lib/resend";
import { getPortalContext } from "@/lib/portal-auth";
import { getPaidLeadRows } from "@/lib/server/payments";
 
export async function POST() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const { data: leads } = await ctx.supabase.from("leads").select("*").eq("client_id", ctx.clientId);
    const { data: client } = await ctx.supabase.from("clients").select("*").eq("id", ctx.clientId).single();
    const rows = await getPaidLeadRows(200);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekRevenue = rows.filter(r => new Date(r.created_at) >= weekStart).reduce((s, r) => s + r.amount, 0);
 
    const resend = getResend();
    await resend.emails.send({
      from: "reports@nesped.com",
      to: client?.owner_email || ctx.userEmail,
      subject: `📈 Informe semanal — ${new Date().toLocaleDateString("es-ES")}`,
      html: `
        <h2>Informe semanal — ${client?.brand_name || "Portal"}</h2>
        <p><strong>Total leads:</strong> ${(leads || []).length}</p>
        <p><strong>Ganados esta semana:</strong> ${(leads || []).filter(l => l.status === "won" && new Date(l.updated_at || l.created_at) >= weekStart).length}</p>
        <p><strong>Ingresos esta semana:</strong> ${weekRevenue.toFixed(0)}€</p>
        <p><strong>Pipeline total:</strong> ${(leads || []).filter(l => !["won","lost"].includes(l.status)).reduce((s, l) => s + Number(l.valor_estimado || 0), 0).toFixed(0)}€</p>
        <hr />
        <p style="color:#888;font-size:12px">Generado automáticamente por NESPED IA</p>
      `,
    });
 
    return Response.json({ success: true, message: "Informe semanal enviado." });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}