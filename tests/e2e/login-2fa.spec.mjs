import { expect, test } from "@playwright/test";

/**
 * Segundo factor.
 *
 * Es el punto donde un fallo deja a alguien fuera de su propia plataforma,
 * así que se comprueban las tres ramas: el camino normal, el código
 * equivocado y el aviso cuando el código sale por SMS porque el correo ha
 * fallado.
 */

async function rellenarAcceso(page) {
  // El botón sólo se habilita cuando React ha hidratado; pulsar antes haría
  // un envío nativo del formulario.
  await page.waitForSelector('button[type="submit"]:not([disabled])');
  await page.locator("#v3-email").fill("owner@demo.com");
  await page.locator("#v3-pass").fill("una-contrasena");
  await page.getByRole("button", { name: /^Entrar$/i }).click();
}

test("el acceso con doble factor pide el código antes de entrar", async ({ page }) => {
  await page.route("**/api/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, requiresTwoFactor: true, verificationChannel: "email" }),
    })
  );

  await page.route("**/api/login/2fa", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, redirectTo: "/login?verificado=1" }),
    })
  );

  await page.goto("/login");
  await rellenarAcceso(page);

  await expect(page.getByRole("heading", { name: /Verificación/i })).toBeVisible();
  await expect(page.getByText(/código de verificación a owner@demo\.com/i)).toBeVisible();

  await page.locator("#v3-code").fill("123456");
  await page.getByRole("button", { name: /Verificar/i }).click();

  await expect(page).toHaveURL(/verificado=1/);
});

test("un código incorrecto no deja pasar y lo dice", async ({ page }) => {
  await page.route("**/api/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, requiresTwoFactor: true, verificationChannel: "email" }),
    })
  );

  await page.route("**/api/login/2fa", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "Código incorrecto" }),
    })
  );

  await page.goto("/login");
  await rellenarAcceso(page);

  await page.locator("#v3-code").fill("000000");
  await page.getByRole("button", { name: /Verificar/i }).click();

  await expect(page.getByText(/Código incorrecto/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("si el correo falla, avisa de que el código va por SMS", async ({ page }) => {
  await page.route("**/api/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, requiresTwoFactor: true, verificationChannel: "sms" }),
    })
  );

  await page.goto("/login");
  await rellenarAcceso(page);

  await expect(page.getByText(/por SMS al móvil de la cuenta/i)).toBeVisible();
});

test("credenciales incorrectas devuelven al formulario con el motivo", async ({ page }) => {
  await page.route("**/api/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "Credenciales incorrectas" }),
    })
  );

  await page.goto("/login");
  await rellenarAcceso(page);

  await expect(page.getByText(/Credenciales incorrectas/i)).toBeVisible();
  await expect(page.locator("#v3-email")).toBeVisible();
});
