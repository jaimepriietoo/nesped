import { AdminShell } from "@/components/v3/admin-shell";

export const metadata = {
  title: "Administración",
  // Las pantallas internas no deben acabar en un buscador.
  robots: { index: false, follow: false },
};

/**
 * Un layout, y no envolver cada página: así las cuatro comparten la barra
 * superior y sólo hay un sitio que tocar cuando cambie la navegación.
 */
export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
