import "./globals.css";

const BASE = "https://nesped.com";
const DESCRIPCION =
  "Nesped contesta al primer tono, entiende qué necesita quien llama y te lo deja apuntado, cualificado y con el siguiente paso escrito.";

export const metadata = {
  metadataBase: new URL(BASE),
  title: {
    default: "Nesped — Cero llamadas sin contestar",
    template: "%s | Nesped",
  },
  description: DESCRIPCION,
  applicationName: "Nesped",
  keywords: [
    "recepcionista virtual", "contestador con IA", "voz con IA",
    "atención telefónica", "captación de leads", "clínicas", "instaladores",
  ],
  authors: [{ name: "Nesped" }],
  alternates: { canonical: "/" },

  // Sin esto, compartir un enlace en WhatsApp o LinkedIn muestra la URL pelada.
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: BASE,
    siteName: "Nesped",
    title: "Nesped — Cero llamadas sin contestar",
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Nesped — Cero llamadas sin contestar",
    description: DESCRIPCION,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // El sitio es negro; el color anterior (#05070a) era del diseño antiguo y
  // dejaba una franja azulada en la barra del navegador móvil.
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
