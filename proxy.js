import { NextResponse } from "next/server";

export function proxy(req) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("nesped_session")?.value;
  const role = req.cookies.get("nesped_role")?.value;

  if ((pathname.startsWith("/portal") || pathname.startsWith("/admin")) && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/admin") && !["admin", "owner", "super_admin"].includes(role || "")) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};
