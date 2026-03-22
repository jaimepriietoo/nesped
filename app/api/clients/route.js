export async function GET() {
  const clients = [
    {
      id: "demo",
      name: "NESPED Demo",
      status: "Activo",
      type: "IA comercial",
    },
    {
      id: "clinica",
      name: "Clínica Dental",
      status: "Activo",
      type: "Recepción médica",
    },
  ];

  return Response.json({
    success: true,
    data: clients,
  });
}