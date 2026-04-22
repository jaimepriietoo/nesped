import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://nesped.com"),
  title: {
    default: "Nesped",
    template: "%s | Nesped",
  },
  description:
    "Nesped convierte llamadas y conversaciones en un sistema premium de captacion, seguimiento y cierre con IA por voz.",
  applicationName: "Nesped",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070a",
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
