import { expect, test } from "@playwright/test";

/**
 * Esqueleto del portal con las APIs simuladas.
 *
 * Comprueba tres cosas que no se ven en una compilación correcta: que el
 * menú entero está, que cada sección pide sus datos y los pinta, y —lo más
 * importante— que una sección que revienta no se lleva por delante el resto
 * del portal.
 */

function json(data) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(data) };
}

const PANEL = {
  success: true,
  currentUser: { id: "u1", email: "owner@demo.com", role: "owner" },
  currentRole: "owner",
  client: { id: "demo", name: "Marca Demo", brand_name: "Marca Demo", is_active: true },
  settings: { monthly_target_leads: 25, monthly_target_conversion: 20, default_deal_value: 250, realtime_refresh_seconds: 15 },
  users: [{ id: "u1", full_name: "Dueño Demo", email: "owner@demo.com", role: "owner", is_active: true, created_at: new Date().toISOString() }],
  leads: [{ id: "l1", nombre: "Ana Ruiz", telefono: "+34600111222", status: "new", score: 90, valor_estimado: 1200, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
  calls: [{ id: "c1", from_number: "+34600111222", to_number: "+34983460825", duration_seconds: 120, lead_captured: true, summary: "Pide presupuesto", created_at: new Date().toISOString() }],
  alerts: [{ id: "a1", severity: "high", message: "Un lead lleva 48 h sin contactar", created_at: new Date().toISOString() }],
  insights: [], benchmarks: [], auditLogs: [], smsTemplates: [], whatsappTemplates: [], quickActions: [],
  metrics: { totalCalls: 1, totalLeads: 1, conversionRate: 0, avgDuration: 120, avgLeadScore: 90, hotLeads: 1, totalPotentialRevenue: 1200, contactedLeads: 0, qualifiedLeads: 0, wonLeads: 0, lostLeads: 0, unassignedLeads: 1, smsSentCount: 0 },
  rankings: { bestDays: [], bestHours: [] },
  pipeline: { new: 1, contacted: 0, qualified: 0, won: 0, lost: 0 },
};

async function montarPortal(context, page, baseURL, { romper = null } = {}) {
  const host = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "nesped_session", value: "playwright", domain: host, path: "/" },
    { name: "nesped_role", value: "owner", domain: host, path: "/" },
  ]);

  await page.route("**/api/**", async (route) => {
    const ruta = new URL(route.request().url()).pathname;

    if (ruta === "/api/portal/overview") return route.fulfill(json(PANEL));

    // Devolver una forma imposible permite comprobar que el fallo queda
    // contenido en su panel en vez de tumbar el portal entero.
    if (romper && ruta === romper) {
      return route.fulfill(json({ success: true, data: { summary: 42, threads: "esto no es una lista" } }));
    }

    if (ruta === "/api/portal/inbox") {
      return route.fulfill(json({ success: true, data: { summary: { totalThreads: 0 }, threads: [] } }));
    }

    if (ruta === "/api/portal/health") {
      return route.fulfill(json({ success: true, data: {
        summary: { level: "healthy", message: "Operativo", highAlerts: 0 },
        services: { supabase: { level: "healthy", message: "ok" } },
        freshness: { leads: { level: "healthy", message: "ok" }, calls: { level: "healthy", message: "ok" } },
        env: { summary: "todo listo", features: [] },
      } }));
    }

    return route.fulfill(json({ success: true, data: { summary: {}, } }));
  });

  await page.goto("/portal");
  await expect(page.getByText("Marca Demo")).toBeVisible();
}

test("el portal carga con la marca y el menú completo", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL);

  // Si el menú se queda corto, alguien ha perdido una sección por el camino.
  const entradas = page.locator(".pv3-nav");
  expect(await entradas.count()).toBeGreaterThanOrEqual(30);

  for (const etiqueta of ["Resumen", "Leads", "Llamadas", "Conversaciones", "Equipo", "Ajustes"]) {
    await expect(page.getByRole("button", { name: new RegExp(etiqueta) })).toBeVisible();
  }
});

test("las secciones piden sus datos y los pintan", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL);

  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.getByText("Ana Ruiz")).toHaveCount(0); // aún no estamos en Leads

  await page.getByRole("button", { name: /Leads/ }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByText("Ana Ruiz")).toBeVisible();

  await page.getByRole("button", { name: /Llamadas/ }).click();
  await expect(page.getByText("Pide presupuesto")).toBeVisible();

  await page.getByRole("button", { name: /Estado/ }).click();
  await expect(page.getByText("Operativo")).toBeVisible();
});

test("la ficha de un lead se abre al pulsar su fila", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL);

  await page.getByRole("button", { name: /Leads/ }).click();
  await page.getByRole("button", { name: /Abrir ficha de Ana Ruiz/i }).click();

  await expect(page.getByRole("complementary", { name: /Ficha de Ana Ruiz/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Guardar cambios/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Enviar SMS/i })).toBeVisible();
});

test("una sección rota no tumba el portal", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL, { romper: "/api/portal/inbox" });

  await page.getByRole("button", { name: /Conversaciones/ }).click();
  await expect(page.getByText(/no se ha podido pintar/i)).toBeVisible();

  // Lo que importa: el menú sigue vivo y se puede seguir trabajando.
  await page.getByRole("button", { name: /Leads/ }).click();
  await expect(page.getByText("Ana Ruiz")).toBeVisible();
});
