import { NextResponse } from "next/server";

export function middleware(req) {
  const { pathname } = req.nextUrl;
  const auth = req.cookies.get("nesped_auth")?.value;

  if (pathname.startsWith("/portal") && auth !== "ok") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*"],
};