// El alta vigente ocurre en /registro ANTES del pago. Un session_id de
// Stripe acredita un pago, nunca la identidad de quien pide cambiar una clave.
function retired() {
  return Response.json({
    success: false,
    message: "Este enlace de alta ha caducado. Entra con tu cuenta o contacta con soporte.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export const GET = retired;
export const POST = retired;
