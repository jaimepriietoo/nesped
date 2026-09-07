/**
 * robots.txt. Sin esto, un rastreador entra en /portal y /admin, se come los
 * redirects al login y desperdicia presupuesto de rastreo en páginas que
 * nunca va a poder ver.
 */
const BASE = "https://nesped.com";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/portal", "/admin", "/api/", "/c/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
