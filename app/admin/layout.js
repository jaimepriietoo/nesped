import { AdminShell } from "@/components/v3/admin-shell";

export const metadata = {
  title: "Administración",
  // Las pantallas internas no deben acabar en un buscador.
  robots: { index: false, follow: false },
};

/**
 * Renderizado por petición, no al compilar: es lo que permite que la
 * política de contenido lleve un nonce distinto cada vez y que ningún
 * script ajeno pueda ejecutarse en las pantallas de administración.
 */
export const dynamic = "force-dynamic";

/**
 * Un layout, y no envolver cada página: así las cuatro comparten la barra
 * superior y sólo hay un sitio que tocar cuando cambie la navegación.
 */
export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
