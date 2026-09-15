import { expect, test } from "@playwright/test";

test("las operaciones sensibles rechazan un origen externo antes de escribir", async ({ request }) => {
  for (const [method, path] of [
    ["post", "/api/login"],
    ["post", "/api/registro"],
    ["post", "/api/portal/users/create"],
    ["patch", "/api/portal/users/update"],
    ["post", "/api/portal/users/reset-password"],
    ["patch", "/api/portal/permissions"],
    ["post", "/api/portal/webhook/test"],
    ["post", "/api/stripe/checkout"],
    ["post", "/api/admin/users"],
    ["post", "/api/admin/clients"],
    ["patch", "/api/admin/portal-users/update"],
  ]) {
    const response = await request[method](path, { headers: { origin: "https://attacker.invalid" }, data: {} });
    expect(response.status(), path).toBe(403);
  }
});

test("las APIs privadas no devuelven datos sin una sesión válida", async ({ request }) => {
  for (const path of ["/api/clients", "/api/calls", "/api/portal/overview", "/api/admin/users", "/api/portal/access-center"]) {
    const response = await request.get(path);
    expect([401, 403], path).toContain(response.status());
  }
});

test("el antiguo alta de Stripe permanece retirado", async ({ request }) => {
  for (const method of ["get", "post"]) {
    const response = await request[method]("/api/portal/account/setup?session_id=cs_security_test", { data: {} });
    expect(response.status()).toBe(410);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});
