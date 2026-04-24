import { NextResponse } from "next/server";

function buildContentSecurityPolicy() {
  const isDev = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://js.stripe.com${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "media-src 'self' blob: https:",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function applySecurityHeaders(response, req) {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy()
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );

  const forwardedProto = req.headers.get("x-forwarded-proto") || "";
  if (
    process.env.NODE_ENV === "production" &&
    String(forwardedProto).toLowerCase() === "https"
  ) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export function proxy(req) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("nesped_session")?.value;
  const role = req.cookies.get("nesped_role")?.value;

  if ((pathname.startsWith("/portal") || pathname.startsWith("/admin")) && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set(
      "next",
      `${pathname}${req.nextUrl.search || ""}`
    );
    return applySecurityHeaders(NextResponse.redirect(loginUrl), req);
  }

  if (pathname.startsWith("/admin") && !["admin", "owner", "super_admin"].includes(role || "")) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/portal", req.url)),
      req
    );
  }

  return applySecurityHeaders(NextResponse.next(), req);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
