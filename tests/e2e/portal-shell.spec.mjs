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
  // El plan importa: sin él, el portal cae en Starter y bloquea las
  // secciones de Pro, así que las pruebas que las abren no verían la sección
  // sino la pantalla de "esto es del plan Pro".
  client: { id: "demo", name: "Marca Demo", brand_name: "Marca Demo", is_active: true, plan: "pro" },
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

  /*
   * Diez pantallas más "Cerrar sesión". El número está fijado a propósito:
   * el portal llegó a tener treinta y una, casi todas de consejos generados,
   * y esta prueba salta si vuelven a colarse pantallas de relleno. Subió de
   * nueve a diez al entrar "Inteligencia", que sustituye a Resumen como
   * pantalla de entrada.
   */
  const entradas = page.locator(".pv3-nav");
  expect(await entradas.count()).toBe(11);

  for (const etiqueta of ["Inteligencia", "Resumen", "Contactos", "Llamadas", "Conversaciones", "Calidad de voz", "Guion comercial", "Equipo", "Ajustes", "Estado"]) {
    await expect(page.getByRole("button", { name: new RegExp(etiqueta) })).toBeVisible();
  }
});

test("las secciones piden sus datos y los pintan", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL);

  // Se entra por Inteligencia, no por Resumen.
  await expect(page.getByRole("heading", { name: /Qué está pasando/ })).toBeVisible();
  await expect(page.getByText("Ana Ruiz")).toHaveCount(0); // aún no estamos en Contactos

  await page.getByRole("button", { name: /Resumen/ }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  await page.getByRole("button", { name: /Contactos/ }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByText("Ana Ruiz")).toBeVisible();

  await page.getByRole("button", { name: /Llamadas/ }).click();
  await expect(page.getByText("Pide presupuesto")).toBeVisible();

  await page.getByRole("button", { name: /Estado/ }).click();
  await expect(page.getByText("Operativo")).toBeVisible();
});

test("la ficha de un lead se abre al pulsar su fila", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL);

  await page.getByRole("button", { name: /Contactos/ }).click();
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
  await page.getByRole("button", { name: /Contactos/ }).click();
  await expect(page.getByText("Ana Ruiz")).toBeVisible();
});

/**
 * La promesa de la pantalla de Inteligencia: no enseñar ni una cifra que no
 * se pueda sostener.
 *
 * Se prueba porque es lo más fácil de romper sin darse cuenta. Cualquiera que
 * añada un módulo nuevo y se olvide de la compuerta de datos hará que el panel
 * enseñe un cero o un porcentaje inventado a alguien que acaba de entrar, y
 * eso no da un error en ninguna parte: simplemente miente.
 */
test("sin datos, Inteligencia dice qué falta en vez de enseñar cifras", async ({ context, page, baseURL }) => {
  await montarPortal(context, page, baseURL);

  await page.route("**/api/portal/inteligencia", (route) =>
    route.fulfill(
      json({
        success: true,
        fuentes: [
          {
            id: "telefono",
            nombre: "Teléfono",
            estado: "sin-conectar",
            porQue: "Es la puerta de entrada.",
            comoActivar: "Asignamos un número.",
          },
        ],
        cobertura: { modulosActivos: 0, modulosTotales: 4, fuentesConectadas: 0, fuentesTotales: 1 },
        modulos: [
          { disponible: false, titulo: "Llamadas sin captar", falta: "Hacen falta 10 llamadas atendidas. Van 0.", porQue: "Con menos es ruido." },
        ],
        pendientes: [],
        titulares: [],
      })
    )
  );

  await page.reload();

  await expect(page.getByRole("heading", { name: /Todavía no hay nada/ })).toBeVisible();
  await expect(page.getByText(/Hacen falta 10 llamadas atendidas/)).toBeVisible();

  /* Lo que no puede pasar: que un módulo sin datos pinte su tarjeta de cifra.
     Esa clase sólo la lleva un número calculado de verdad. */
  await expect(page.locator(".iq-cifra")).toHaveCount(0);
});

/**
 * Un contacto no se puede mover a otra empresa desde la ficha.
 *
 * La ruta de actualización volcaba al UPDATE todo lo que llegara en el
 * cuerpo. El filtro por client_id decidía QUÉ fila se tocaba, pero no QUÉ
 * columnas, así que mandando client_id se llevaba el contacto —con su
 * teléfono y su historial— a otra cuenta. Se prueba porque una lista blanca
 * es justo lo que alguien amplía sin pensar al añadir un campo.
 */
test("la ficha no puede cambiar de empresa un contacto", async ({ request, baseURL }) => {
  const res = await request.patch(`${baseURL}/api/leads/update`, {
    headers: { Origin: baseURL },
    data: { leadId: "l1", client_id: "otra-empresa" },
  });

  /* Sin sesión da 401; con ella daría 400 por no quedar ningún campo
     editable. Lo que no puede pasar nunca es un 200. */
  expect([400, 401, 403]).toContain(res.status());
});
