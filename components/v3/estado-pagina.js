import { Inter } from "next/font/google";
import "./v3.css";
import "./estado-pagina.css";
import { Logo } from "./chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/**
 * Pantalla a página completa para estados que no son contenido: error, 404 y
 * carga. Una sola pieza para las tres, porque son la misma composición con
 * distinto texto, y así no se desalinean entre ellas con el tiempo.
 */
export function EstadoPagina({ codigo, titulo, texto, children }) {
  return (
    <div className={`v3 estado ${inter.className}`}>
      <div className="estado-caja">
        <span className="estado-marca">
          <Logo />
        </span>
        {codigo ? <span className="estado-codigo">{codigo}</span> : null}
        <h1 className="estado-titulo">{titulo}</h1>
        {texto ? <p className="estado-texto">{texto}</p> : null}
        {children ? <div className="estado-acciones">{children}</div> : null}
      </div>
    </div>
  );
}
