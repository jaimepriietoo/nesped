import { expect, test } from "@playwright/test";

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

test("portal shell loads control, access and voice centers with mocked APIs", async ({
  context,
  page,
  baseURL,
}) => {
  const host = new URL(baseURL).hostname;

  await context.addCookies([
    { name: "nesped_session", value: "playwright", domain: host, path: "/" },
    { name: "nesped_role", value: "owner", domain: host, path: "/" },
  ]);

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === "/api/portal/overview") {
      return route.fulfill(
        json({
          success: true,
          currentUser: {
            id: "u1",
            email: "owner@demo.com",
            full_name: "Owner Demo",
            role: "owner",
          },
          client: {
            id: "demo",
            name: "Demo Brand",
            brand_name: "Demo Brand",
            owner_email: "owner@demo.com",
          },
          users: [],
          calls: [],
          leads: [],
          smsTemplates: [],
          whatsappTemplates: [],
          settings: {},
          comments: [],
          notes: [],
          reminders: [],
          experiments: [],
        })
      );
    }

    if (pathname === "/api/portal/health") {
      return route.fulfill(
        json({
          success: true,
          data: {
            summary: {
              level: "healthy",
              message: "Operativo",
              highAlerts: 0,
            },
            services: {
              auth: { ready: true, level: "healthy", detail: "ok" },
              ai: { ready: true, level: "healthy", detail: "ok" },
              telephony: { ready: true, level: "healthy", detail: "ok" },
              whatsapp: { ready: true, level: "healthy", detail: "ok" },
              billing: { ready: true, level: "healthy", detail: "ok" },
              reporting: { ready: true, level: "healthy", detail: "ok" },
            },
            freshness: {
              leads: { level: "healthy" },
              calls: { level: "healthy" },
            },
            env: {
              summary: { ready: true },
              features: [],
            },
          },
        })
      );
    }

    if (pathname === "/api/portal/access-center") {
      return route.fulfill(
        json({
          success: true,
          data: {
            summary: {
              activeUsers: 1,
              inactiveUsers: 0,
              elevatedUsers: 1,
              usersWithoutPassword: 0,
              usersRequiringTwoFactor: 1,
              recommendations: 0,
            },
            users: [
              {
                id: "u1",
                full_name: "Owner Demo",
                email: "owner@demo.com",
                phone: "",
                role: "owner",
                is_active: true,
                hasPassword: true,
                authCreatedAt: new Date().toISOString(),
                requiresTwoFactor: true,
              },
            ],
            policies: {
              signed: true,
              secureCookie: false,
              sameSite: "lax",
              maxAgeDays: 7,
              secretConfigured: true,
              rateLimit: true,
              rateLimitStrategy: "memory",
              sameOriginGuard: true,
              twoFactor: {
                requiredRoles: ["owner", "admin"],
                delivery: "email",
              },
            },
            roleMatrix: [
              {
                role: "owner",
                label: "Owner",
                capabilities: ["billing", "security"],
              },
            ],
            recommendations: [],
            auditLogs: [],
          },
        })
      );
    }

    if (pathname === "/api/portal/api-hub") {
      return route.fulfill(
        json({
          success: true,
          data: {
            summary: {
              readinessScore: 88,
              endpoints: 4,
              configuredIntegrations: 3,
              publicSurface: "custom-domain",
            },
            endpoints: [],
            integrations: [],
            eventCatalog: [],
            recipes: [],
          },
        })
      );
    }

    if (pathname === "/api/portal/voice-center") {
      return route.fulfill(
        json({
          success: true,
          data: {
            compliance: {
              noticeText: "Aviso legal activo.",
              policyUrl: "/legal/voice-compliance",
              recordingRetentionDays: 30,
              transcriptRetentionDays: 90,
            },
            summary: {
              total: 0,
              withRecording: 0,
              avgScore: 0,
              avgDuration: 0,
              capturedLeads: 0,
            },
            commonIssues: [],
            calls: [],
          },
        })
      );
    }

    if (pathname === "/api/portal/inbox") {
      return route.fulfill(json({ success: true, data: { threads: [], summary: {} } }));
    }

    return route.fulfill(json({ success: true, data: {}, leads: [], users: [], calls: [] }));
  });

  await page.goto("/portal");

  await expect(page.getByText("Demo Brand")).toBeVisible();
  await expect(page.getByRole("button", { name: /Access/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /API Hub/i })).toBeVisible();

  await page.getByRole("button", { name: /Access/i }).click();
  await expect(page.getByText("Access Center")).toBeVisible();
  await expect(page.getByText("2FA requerido")).toBeVisible();

  await page.getByRole("button", { name: /API Hub/i }).click();
  await expect(
    page.locator(".section-title").filter({ hasText: "API Hub" })
  ).toBeVisible();

  await page.getByRole("button", { name: /Voice/i }).click();
  await expect(page.getByText("Cumplimiento de grabaciones")).toBeVisible();
});
