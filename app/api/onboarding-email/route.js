export async function POST(req) {
  const body = await req.json();

  console.log("EMAIL A ENVIAR:", body);

  return Response.json({ ok: true });
}