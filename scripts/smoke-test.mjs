import dotenv from "dotenv";

dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

const providedBaseUrl = process.argv[2];
const baseUrl = String(
  providedBaseUrl ||
    process.env.SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
).replace(/\/+$/, "");

const cookieJar = new Map();

function recordCookies(response) {
  const cookieHeaders =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  for (const cookie of cookieHeaders) {
    const [pair] = String(cookie || "").split(";");
    const [name, value] = String(pair || "").split("=");
    if (name && value) {
      cookieJar.set(name.trim(), value.trim());
    }
  }
}

function cookieHeader() {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function request(pathname, options = {}) {
  const url = `${baseUrl}${pathname}`;
  const headers = new Headers(options.headers || {});
  const cookies = cookieHeader();
  if (cookies) headers.set("cookie", cookies);

  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers,
  });

  recordCookies(response);
  return response;
}

async function assertOk(pathname, options = {}) {
  const response = await request(pathname, options);
  if (response.status >= 400) {
    const body = await response.text().catch(() => "");
    throw new Error(`${pathname} failed with ${response.status}: ${body.slice(0, 300)}`);
  }

  return response;
}

async function run() {
  console.log(`Smoke testing ${baseUrl}`);

  await assertOk("/");
  await assertOk("/pricing");
  await assertOk("/login");

  const smokeEmail = process.env.SMOKE_TEST_EMAIL || "";
  const smokePassword = process.env.SMOKE_TEST_PASSWORD || "";

  if (smokeEmail && smokePassword) {
    const loginResponse = await assertOk("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: baseUrl,
        referer: `${baseUrl}/login`,
      },
      body: JSON.stringify({
        email: smokeEmail,
        password: smokePassword,
      }),
    });

    const loginPayload = await loginResponse.json();
    if (!loginPayload?.success) {
      throw new Error("Login smoke test returned success=false");
    }

    if (loginPayload.requiresTwoFactor) {
      const twoFactorCode =
        process.env.SMOKE_TEST_2FA_CODE || loginPayload.debugCode || "";

      if (!twoFactorCode) {
        throw new Error(
          "Login requires 2FA but SMOKE_TEST_2FA_CODE is not configured."
        );
      }

      const verifyResponse = await assertOk("/api/login/2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: baseUrl,
          referer: `${baseUrl}/login`,
        },
        body: JSON.stringify({
          code: String(twoFactorCode),
        }),
      });

      const verifyPayload = await verifyResponse.json();
      if (!verifyPayload?.success) {
        throw new Error("2FA smoke test returned success=false");
      }
    }

    await assertOk("/api/session");

    const portalResponse = await request("/portal");
    if (portalResponse.status >= 300 && portalResponse.status < 400) {
      throw new Error("/portal redirected instead of loading an authenticated page");
    }
    if (portalResponse.status >= 400) {
      throw new Error(`/portal failed with ${portalResponse.status}`);
    }

    const readinessResponse = await request("/api/ops/readiness");
    if (readinessResponse.status !== 200 && readinessResponse.status !== 403) {
      throw new Error(
        `/api/ops/readiness returned unexpected status ${readinessResponse.status}`
      );
    }
  } else {
    console.log(
      "Skipping authenticated smoke checks because SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD are not configured."
    );
  }

  console.log("Smoke test passed.");
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
