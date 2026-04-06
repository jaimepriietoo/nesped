export async function POST() {
  return Response.json({
    success: false,
    message: "Stripe portal desactivado temporalmente",
  });
}