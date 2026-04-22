import { getResend } from "@/lib/resend";
import { getPortalContext } from "@/lib/portal-auth";
 
export async function POST() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
 
    const { data: leads } = await ctx.supabase.from("leads").select("*").eq("client_id", ctx.clientId);
    const { data: client } = await ctx.supabase.from("clients").select("*").eq("id", ctx.clientId).single();
 
    const total = (leads || []).length;
    const hot = (leads || []).filter(l => Number(l.score || 0) >= 80).length;
    const won = (leads || []).filter(l => l.status === "won").length;
    const pipeline = (leads || []).filter(l => !["won","lost"].includes(l.status)).reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
 
    const resend = getResend();
    await resend.emails.send({
      from: "reports@nesped.com",
      to: client?.owner_email || ctx.userEmail,
      subject: `📊 Informe diario — ${new Date().toLocaleDateString("es-ES")}`,
      html: `
        <h2>Informe diario — ${client?.brand_name || "Portal"}</h2>
        <p><strong>Total leads:</strong> ${total}</p>
        <p><strong>Leads calientes (80+):</strong> ${hot}</p>
        <p><strong>Ganados:</strong> ${won}</p>
        <p><strong>Pipeline activo:</strong> ${pipeline.toFixed(0)}€</p>
        <hr />
        <p style="color:#888;font-size:12px">Generado automáticamente por NESPED IA</p>
      `,
    });
 
    return Response.json({ success: true, message: "Informe diario enviado." });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}