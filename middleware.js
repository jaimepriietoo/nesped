import { NextResponse } from "next/server";

export function middleware(req) {
  const { pathname } = req.nextUrl;
  const auth = req.cookies.get("nesped_auth")?.value;
  const role = req.cookies.get("nesped_role")?.value;

  if ((pathname.startsWith("/portal") || pathname.startsWith("/admin")) && auth !== "ok") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};