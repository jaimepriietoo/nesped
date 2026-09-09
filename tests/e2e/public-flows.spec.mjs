import { expect, test } from "@playwright/test";

/**
 * Recorrido público: que se pueda llegar a pagar y que el aviso legal de las
 * grabaciones esté donde tiene que estar.
 */

test("la portada lleva a la demo y al aviso de grabaciones", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Convierte cada llamada/i })
  ).toBeVisible();

  // El consentimiento de grabación no es opcional: si desaparece, la demo
  // estaría grabando llamadas sin avisar.
  await expect(
    page.getByText(/la llamada pueda ser grabada/i)
  ).toBeVisible();

  await page.getByRole("link", { name: /Ver política de grabaciones/i }).click();
  await expect(page).toHaveURL(/\/legal\/voice-compliance/);
  await expect(
    page.getByRole("heading", { name: /Política de grabaciones/i })
  ).toBeVisible();
});

test("pricing enseña precios reales y lleva al checkout", async ({ page }) => {
  await page.goto("/pricing");

  await expect(
    page.getByRole("heading", { name: /Ordena\. Entiende\./i })
  ).toBeVisible();

  const precios = page.locator(".v3-price");
  await expect(precios.first()).toBeVisible();

  /*
   * Los importes salen de Stripe, no del código. La prueba no fija una cifra
   * —cambiarla en Stripe no debe romper el test— pero sí exige que sea una
   * cifra: si la web volviera a inventarse el precio o dejara de resolverlo,
   * aquí saltaría.
   */
  const textos = await precios.allInnerTexts();
  const conImporte = textos.filter((t) => /\d/.test(t));
  expect(conImporte.length).toBeGreaterThan(0);

  /* Los tres planes tienen salida: los dos contratables llevan al alta, y
     Enterprise a ventas. Que uno se quede sin botón es un fallo que no da
     error en ninguna parte, sólo pierde la venta. */
  const alta = page.locator('a[href^="/registro?plan="]');
  const ventas = page.locator('a[href^="mailto:"]');
  expect(await alta.count()).toBeGreaterThanOrEqual(2);
  expect(await ventas.count()).toBeGreaterThanOrEqual(1);
});

test("las páginas internas no se sirven sin sesión", async ({ request }) => {
  for (const ruta of ["/portal", "/admin"]) {
    const res = await request.get(ruta, { maxRedirects: 0 });
    expect(res.status(), `${ruta} debería redirigir al login`).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
  }

  // La cartera de clientes fue pública en su día; no puede volver a serlo.
  const clientes = await request.get("/api/clients");
  expect([401, 403]).toContain(clientes.status());
});

test("existen robots y sitemap, y el 404 responde 404", async ({ request }) => {
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  expect((await request.get("/ruta-que-no-existe")).status()).toBe(404);
});

/**
 * No se entra a la administración falsificando cookies.
 *
 * El middleware decidía el acceso mirando `nesped_session` (le bastaba con
 * que existiera, cualquier valor servía) y `nesped_role`, ambas en claro y
 * ambas escribibles desde las herramientas del navegador. Ahora verifica la
 * firma del token, y esta prueba existe para que no se vuelva a la cookie
 * suelta buscando comodidad.
 */
test("las cookies falsificadas no abren el panel de administración", async ({ request, baseURL }) => {
  const conCookiesInventadas = {
    headers: { Cookie: "nesped_session=loquesea; nesped_role=admin; nesped_auth=ok" },
    maxRedirects: 0,
  };

  const admin = await request.get(`${baseURL}/admin`, conCookiesInventadas);
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toContain("/login");

  const portal = await request.get(`${baseURL}/portal`, conCookiesInventadas);
  expect(portal.status()).toBe(307);
  expect(portal.headers().location).toContain("/login");
});

/**
 * El correo de bienvenida no se puede disparar desde fuera.
 *
 * Salía desde nuestro dominio y metía en el HTML, sin escapar, lo que le
 * mandaran. Con eso se podía escribir el correo entero —texto y enlace— y
 * enviarlo a quien fuera con un remitente legítimo, con SPF y DKIM buenos.
 * El daño no es el correo: es que se quema el dominio y a partir de ahí los
 * avisos de verdad acaban en la carpeta de basura de todos los clientes.
 */
test("el correo de bienvenida exige credencial interna", async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/onboarding-email`, {
    data: { email: "cualquiera@ejemplo.test", clientName: "<script>alert(1)</script>" },
  });
  expect([401, 403]).toContain(res.status());
});

/**
 * Un cliente no puede leer ni tocar los contactos de otro.
 *
 * Cuatro rutas —eventos, notas, comentarios y recordatorios— filtraban por el
 * lead_id de la URL y por nada más. Pedían sesión, sí, pero no comprobaban de
 * quién era ese contacto: con una cuenta recién creada se leía el historial
 * de cualquier otra empresa. Comprobado en su día, no supuesto.
 *
 * Se prueba sin sesión porque lo que vigila esta prueba es que la comprobación
 * exista; la de pertenencia con sesión válida vive en las pruebas del portal.
 */
test("las rutas de un contacto no responden sin sesión", async ({ request, baseURL }) => {
  const ajeno = "00000000-0000-0000-0000-000000000000";

  for (const ruta of ["lead-events", "lead-notes", "lead-comments", "lead-reminders"]) {
    const res = await request.get(`${baseURL}/api/${ruta}?lead_id=${ajeno}`);
    expect([401, 403, 404]).toContain(res.status());
  }
});

/**
 * Las tareas de sistema no las lanza un cliente.
 *
 * Recorren los contactos de TODAS las empresas y desde ahí mandan mensajes,
 * hacen llamadas y escriben en sus fichas. Aceptaban una sesión de portal con
 * rol owner, así que cualquier cliente podía disparar mensajería saliente a
 * los contactos de todos los demás.
 */
test("los automatismos solo se lanzan desde dentro", async ({ request, baseURL }) => {
  const rutas = [
    "automation/run-nba",
    "automation/run-voice-calls",
    "automation/run-funnel",
    "automation/reactivate-cold-leads",
    "nightly",
  ];

  for (const ruta of rutas) {
    const res = await request.post(`${baseURL}/api/${ruta}`, { headers: { Origin: baseURL } });
    expect([401, 403]).toContain(res.status());
  }

  // El informe de estado dibuja el mapa de la configuración de seguridad.
  const readiness = await request.get(`${baseURL}/api/ops/readiness`);
  expect([401, 403]).toContain(readiness.status());
});
