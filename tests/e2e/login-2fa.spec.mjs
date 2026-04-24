import { expect, test } from "@playwright/test";

test("owner login completes the 2FA step before entering", async ({ page }) => {
  await page.route("**/api/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        requiresTwoFactor: true,
        verificationChannel: "email",
      }),
    });
  });

  await page.route("**/api/login/2fa", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        redirectTo: "/login?verified=1",
      }),
    });
  });

  await page.goto("/login");
  await page.getByPlaceholder("cliente@empresa.com").fill("owner@demo.com");
  await page.getByPlaceholder("Tu acceso").fill("secret123");
  await page.getByRole("button", { name: /Entrar al portal/i }).click();

  await expect(
    page.getByRole("heading", { name: /Verificación segura/i })
  ).toBeVisible();
  await expect(
    page.getByText(/Te hemos enviado un código de verificación/i)
  ).toBeVisible();

  await page.getByPlaceholder("123456").fill("123456");
  await page.getByRole("button", { name: /Confirmar acceso/i }).click();

  await expect(page).toHaveURL(/verified=1/);
});
