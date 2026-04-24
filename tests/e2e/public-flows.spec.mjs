import { expect, test } from "@playwright/test";

test("pricing and demo surface expose the premium public flows", async ({
  page,
}) => {
  await page.goto("/pricing");

  await expect(
    page.getByRole("link", { name: /Empezar con Starter/i })
  ).toHaveAttribute("href", /\/api\/stripe\/public-checkout\?plan=starter/);

  await expect(
    page.getByRole("link", { name: /Contratar Pro/i })
  ).toHaveAttribute("href", /\/api\/stripe\/public-checkout\?plan=pro/);

  await expect(
    page.getByRole("link", { name: /Hablar con ventas/i })
  ).toHaveAttribute("href", /mailto:/);

  await page.goto("/");

  await expect(
    page.getByText(/Al lanzar la demo aceptas que la llamada pueda ser grabada/i)
  ).toBeVisible();

  await page.getByRole("link", { name: /Ver política de grabaciones/i }).click();
  await expect(page).toHaveURL(/\/legal\/voice-compliance/);
  await expect(
    page.getByRole("heading", {
      name: /Política de grabaciones y transcripciones/i,
    })
  ).toBeVisible();
});
