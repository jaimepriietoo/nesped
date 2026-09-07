import { NextResponse } from "next/server";

/* =========================================================================
   Cabeceras de seguridad y política de contenido.

   La pieza central es la CSP con nonce. Antes decía
   `script-src 'self' 'unsafe-inline'`, y eso anula el motivo de tener CSP:
   con 'unsafe-inline' cualquier script que un atacante consiga colar en el
   HTML se ejecuta igual. Ahora sólo corre el script que lleve el nonce de
   esa petición concreta, que se genera al azar cada vez y un atacante no
   puede adivinar.
   ========================================================================= */

/** Hosts a los que el navegador puede abrir conexiones. */
const CONEXIONES = [
  "'self'",
  "https://*.supabase.co",       // base de datos y realtime
  "wss://*.supabase.co",
  "https://*.ingest.de.sentry.io", // errores
  "https://*.ingest.sentry.io",
  "https://api.stripe.com",
  "https://vitals.vercel-insights.com",
];

/** Orígenes desde los que se sirven medios (el vídeo de la portada). */
const MEDIOS = ["'self'", "blob:", "data:", "https://*.cloudfront.net"];

/**
 * Devuelve la directiva de scripts.
 *
 * Hay dos niveles a propósito.
 *
 * El fuerte, con nonce y 'strict-dynamic', sólo corre el script que lleva el
 * nonce de esa petición: un script inyectado no se ejecuta aunque llegue a
 * colarse en el HTML. Exige que la página se renderice por petición, porque
 * una prerenderizada al compilar no puede llevar un nonce distinto cada vez.
 * Se aplica a /portal y /admin, que es donde se pintan datos escritos por
 * terceros —nombres de leads, resúmenes, transcripciones— y donde un XSS
 * tendría sesión con la que hacer daño.
 *
 * El estático mantiene 'unsafe-inline' porque las páginas públicas se
 * prerenderizan y no admiten nonce. Ahí no se renderiza nada que escriba un
 * desconocido, así que la superficie es mínima, y a cambio se sirven desde
 * caché sin gastar servidor.
 */
function directivaScripts(nonce, esDev, conNonce) {
  if (esDev) {
    // La recarga en caliente necesita eval y scripts sueltos.
    return "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  }
  if (conNonce) {
    return `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  }
  return "script-src 'self' 'unsafe-inline' https://js.stripe.com";
}

function construirCsp(nonce, esDev, conNonce = false) {
  const directivas = [
    "default-src 'self'",
    directivaScripts(nonce, esDev, conNonce),

    /*
     * En estilos sí se mantiene 'unsafe-inline': la interfaz usa atributos
     * style= por todas partes y CSP los bloquea sin esto. El riesgo es muy
     * inferior al de los scripts —con CSS no se ejecuta código— y la
     * alternativa sería reescribir cientos de componentes.
     */
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",

    // Los clientes ponen la URL de su logotipo, así que no se puede acotar.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${CONEXIONES.join(" ")}${esDev ? " ws://localhost:* http://localhost:*" : ""}`,
    `media-src ${MEDIOS.join(" ")}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  if (!esDev) {
    directivas.push("upgrade-insecure-requests");
  }

  return directivas.join("; ");
}

function aplicarCabeceras(response, req, nonce, conNonce) {
  const esDev = process.env.NODE_ENV !== "production";

  response.headers.set("Content-Security-Policy", construirCsp(nonce, esDev, conNonce));

  // Qué se manda al enlazar fuera: origen sí, ruta y parámetros no.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Sin esto, un fichero subido con extensión inocente puede acabar
  // ejecutándose porque el navegador adivina su tipo.
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Contra clickjacking. frame-ancestors ya lo cubre en navegadores
  // modernos; esto es el respaldo para los que no leen CSP.
  response.headers.set("X-Frame-Options", "DENY");

  response.headers.set(
    "Permissions-Policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "accelerometer=()",
      "gyroscope=()",
      "browsing-topics=()",
      "interest-cohort=()",
    ].join(", ")
  );

  // Aísla la ventana: una página abierta desde aquí no puede manipularla,
  // y cierra la puerta a los ataques de canal lateral tipo Spectre.
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Origin-Agent-Cluster", "?1");

  // Resolver DNS por adelantado filtra a dónde va a navegar el usuario.
  response.headers.set("X-DNS-Prefetch-Control", "off");

  // Cabeceras que sólo delatan con qué está hecho el sitio.
  response.headers.delete("X-Powered-By");
  response.headers.set("X-Robots-Tag", "index, follow");

  const protocolo = String(req.headers.get("x-forwarded-proto") || "").toLowerCase();
  if (process.env.NODE_ENV === "production" && protocolo === "https") {
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

  // Un nonce distinto por petición. Se pasa a Next en una cabecera de
  // petición: al ver un nonce en la CSP, Next lo pone en sus propios
  // <script> y así son los únicos que el navegador ejecuta.
  // Sólo las zonas con sesión se renderizan por petición y pueden llevar nonce.
  const conNonce = pathname.startsWith("/portal") || pathname.startsWith("/admin");

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const cabecerasPeticion = new Headers(req.headers);
  cabecerasPeticion.set("x-nonce", nonce);
  cabecerasPeticion.set(
    "Content-Security-Policy",
    construirCsp(nonce, process.env.NODE_ENV !== "production", conNonce)
  );

  if ((pathname.startsWith("/portal") || pathname.startsWith("/admin")) && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", `${pathname}${req.nextUrl.search || ""}`);
    return aplicarCabeceras(NextResponse.redirect(loginUrl), req, nonce, conNonce);
  }

  if (pathname.startsWith("/admin") && !["admin", "owner", "super_admin"].includes(role || "")) {
    return aplicarCabeceras(
      NextResponse.redirect(new URL("/portal", req.url)),
      req,
      nonce,
      conNonce
    );
  }

  return aplicarCabeceras(
    NextResponse.next({ request: { headers: cabecerasPeticion } }),
    req,
    nonce,
    conNonce
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
