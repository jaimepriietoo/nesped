import { expect, test } from "@playwright/test";
import fs from "node:fs";

/* En local la clave de Stripe vive en .env.local, que lee el servidor y no el
   corredor de pruebas; en CI entra como secreto del repositorio. */
function hayStripe() {
  if (process.env.STRIPE_SECRET_KEY) return true;
  try { return /^STRIPE_SECRET_KEY=.+/m.test(fs.readFileSync(".env.local", "utf8")); } catch { return false; }
}

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

/**
 * La portada tiene que estar VIVA, no sólo pintada.
 *
 * Esto no lo comprobaba nadie, y llegó a estar rota semanas: Next bloquea por
 * defecto sus recursos de desarrollo si la petición no viene del nombre con el
 * que arrancó —`localhost`—, y esta configuración de Playwright apunta a
 * 127.0.0.1. El WebSocket de recarga se rechazaba, el arranque del cliente de
 * Next moría con él y React no hidrataba. El HTML lo pinta el servidor, así
 * que la página se veía perfecta y no respondía a un solo clic. Todas las
 * pruebas seguían en verde porque ninguna necesitaba interacción.
 *
 * Se comprueba lo más barato que sólo puede pasar con JavaScript vivo: abrir
 * el menú. Si esto falla, lo que hay delante del cliente es una foto.
 */
test("la portada responde: el menú se abre", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 860 });
  await page.goto("/");

  await expect(page.locator(".v3-menu")).toHaveCount(0);
  await page.locator(".v3-burger").click();
  await expect(page.locator(".v3-menu")).toBeVisible();
});

test("ya no hay planes: la antigua página de precios lleva al contacto", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page).toHaveURL(/\/#contacto$/);
  await expect(page.getByRole("heading", { name: /Quieres saber más/i })).toBeVisible();
  await expect(page.locator('#contacto a[href^="mailto:"]').first()).toBeVisible();
  await expect(page.locator(".v3-price")).toHaveCount(0);
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

/**
 * La prueba de webhooks no se puede usar para mirar dentro de casa.
 *
 * Hacía `fetch` a la dirección que le mandaras y devolvía 1.200 caracteres de
 * la respuesta. Desde una cuenta de cliente se podía apuntar a localhost, a
 * 169.254.169.254 o a la red privada y leer lo que hubiera: la petición sale
 * desde nuestro servidor, así que llega donde el atacante no llega.
 */
test("la prueba de webhooks rechaza direcciones internas", async ({ request, baseURL }) => {
  const internas = [
    "http://localhost:3000/api/portal/overview",
    "https://127.0.0.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.5/",
  ];

  for (const url of internas) {
    const res = await request.post(`${baseURL}/api/portal/webhook/test`, {
      headers: { Origin: baseURL },
      data: { url },
    });
    /* Sin sesión son 401; con ella, 400 por dirección interna. Lo que no
       puede pasar nunca es que se llegue a hacer la petición. */
    expect([400, 401, 403]).toContain(res.status());
  }
});
