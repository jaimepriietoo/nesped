import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
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
