export function getPermissionCatalog() {
  return [
    { id: "crm.view", label: "Ver CRM", area: "crm" },
    { id: "crm.edit", label: "Editar contactos", area: "crm" },
    { id: "crm.export", label: "Exportar contactos", area: "crm" },
    { id: "inbox.reply", label: "Responder bandeja de entrada", area: "inbox" },
    { id: "ai.use", label: "Usar IA", area: "ai" },
    { id: "voice.review", label: "Revisar voz", area: "voice" },
    { id: "voice.demo", label: "Lanzar llamadas de prueba", area: "voice" },
    { id: "automations.run", label: "Ejecutar automatizaciones", area: "ops" },
    { id: "playbooks.manage", label: "Gestionar guiones", area: "ops" },
    { id: "experiments.manage", label: "Gestionar experimentos", area: "ops" },
    { id: "billing.manage", label: "Gestionar facturación", area: "billing" },
    { id: "billing.checkout", label: "Comprar bonos", area: "billing" },
    { id: "brand.manage", label: "Gestionar marca", area: "brand" },
    { id: "api.manage", label: "Gestionar API", area: "api" },
    { id: "api.test", label: "Probar webhooks", area: "api" },
    { id: "security.manage", label: "Gestionar seguridad", area: "security" },
    { id: "reports.view", label: "Ver reportes", area: "reporting" },
    { id: "reports.send", label: "Enviar informes", area: "reporting" },
    { id: "audit.export", label: "Exportar auditoría", area: "reporting" },
    { id: "routing.view", label: "Ver reparto", area: "routing" },
    { id: "routing.manage", label: "Gestionar departamentos, destinatarios y automatismos", area: "routing" },
  ];
}

export function buildPermissionMatrix({ users = [], permissionRows = [] } = {}) {
  const catalog = getPermissionCatalog();
  const byUser = new Map();

  permissionRows.forEach((row) => {
    const key = String(row.user_id || "");
    if (!key) return;
    if (!byUser.has(key)) byUser.set(key, new Set());
    byUser.get(key).add(String(row.scope || ""));
  });

  return {
    catalog,
    rows: users.map((user) => {
      const scopes = [...(byUser.get(String(user.id || "")) || new Set())];
      return {
        userId: user.id,
        email: user.email || "",
        role: user.role || "viewer",
        scopes,
        grants: catalog.map((item) => ({
          ...item,
          enabled: scopes.includes(item.id),
        })),
      };
    }),
  };
}
