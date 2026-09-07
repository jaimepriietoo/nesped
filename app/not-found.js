import Link from "next/link";
import { EstadoPagina } from "@/components/v3/estado-pagina";

export const metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <EstadoPagina
      codigo="404"
      titulo="Aquí no hay nada"
      texto="La dirección no existe o ha dejado de existir. Desde el inicio llegas a todo lo demás."
    >
      <Link className="v3-btn v3-btn--white" href="/">Ir a inicio</Link>
      <a className="v3-btn" href="/portal">Entrar al portal</a>
    </EstadoPagina>
  );
}
