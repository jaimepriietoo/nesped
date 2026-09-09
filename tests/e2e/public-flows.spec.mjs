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
