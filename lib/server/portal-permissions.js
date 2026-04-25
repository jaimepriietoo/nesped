export function getPermissionCatalog() {
  return [
    { id: "crm.view", label: "Ver CRM", area: "crm" },
    { id: "crm.edit", label: "Editar leads", area: "crm" },
    { id: "inbox.reply", label: "Responder inbox", area: "inbox" },
    { id: "voice.review", label: "Revisar voz", area: "voice" },
    { id: "automations.run", label: "Ejecutar automatizaciones", area: "ops" },
    { id: "billing.manage", label: "Gestionar billing", area: "billing" },
    { id: "brand.manage", label: "Gestionar marca", area: "brand" },
    { id: "api.manage", label: "Gestionar API", area: "api" },
    { id: "security.manage", label: "Gestionar seguridad", area: "security" },
    { id: "reports.view", label: "Ver reportes", area: "reporting" },
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
