import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Anuncia con qué está hecho el sitio y su versión: es información gratis
  // para quien busca exploits conocidos del framework. El middleware no
  // puede quitarla porque el servidor la añade después.
  poweredByHeader: false,

  /*
   * Next bloquea por defecto las peticiones a sus recursos de desarrollo que
   * no vengan del nombre con el que arrancó el servidor, que es `localhost`.
   *
   * Y la configuración de Playwright apunta a 127.0.0.1, que para el
   * navegador es OTRO origen. Consecuencia: el WebSocket de recarga se
   * rechazaba, el arranque del cliente de Next moría con él y React no
   * llegaba a hidratar. La página se veía entera —el HTML lo pinta el
   * servidor— pero no respondía a un solo clic. Las pruebas seguían en verde
   * porque ninguna de las que había necesitaba interacción.
   *
   * Sólo afecta a desarrollo: en producción esta opción no se usa.
   */
  allowedDevOrigins: ["127.0.0.1"],

  /**
   * El sitio vivió un tiempo en /v3 mientras se rehacía. Ahora es la raíz,
   * pero puede haber enlaces guardados apuntando allí: 308 permanente para
   * que no acaben en un 404 y para que los buscadores trasladen la señal.
   */
  async redirects() {
    return [
      { source: "/v3", destination: "/", permanent: true },
      { source: "/v3/pricing", destination: "/pricing", permanent: true },
      { source: "/v3/login", destination: "/login", permanent: true },
      { source: "/v3/legal", destination: "/legal/voice-compliance", permanent: true },
      { source: "/portal-v3", destination: "/portal", permanent: true },

      /*
       * El icono se genera en /icon desde el mismo trazado que el logo, pero
       * los navegadores siguen pidiendo /favicon.ico a pelo y eso dejaba un
       * 404 en la consola de todas las páginas.
       */
      { source: "/favicon.ico", destination: "/icon", permanent: false },
    ];
  },

  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
    dangerouslyAllowLocalIP: false,
    maximumRedirects: 0,
  },
};

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  silent: true,
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
