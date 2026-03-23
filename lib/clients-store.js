let clients = [
  {
    id: "demo",
    name: "NESPED Demo",
    type: "IA comercial",
    status: "Activo",
    tagline: "Automatización de llamadas y captación de leads con IA",
    logoText: "N",
    theme: {
      accent: "bg-blue-500/20",
      accentText: "text-blue-300",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-emerald-500/15 text-emerald-300",
    },
  },
  {
    id: "clinica",
    name: "Clínica Dental",
    type: "Recepción médica",
    status: "Activo",
    tagline: "Recepción inteligente para pacientes y citas",
    logoText: "C",
    theme: {
      accent: "bg-emerald-500/20",
      accentText: "text-emerald-300",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-cyan-500/15 text-cyan-300",
    },
  },
];

export function getClients() {
  return clients;
}

export function getClientById(id) {
  return clients.find((client) => client.id === id) || null;
}

export function updateClient(id, updates) {
  clients = clients.map((client) => {
    if (client.id !== id) return client;

    return {
      ...client,
      ...updates,
      theme: {
        ...client.theme,
        ...(updates.theme || {}),
      },
    };
  });

  return getClientById(id);
}