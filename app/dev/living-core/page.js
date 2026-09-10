import { notFound } from "next/navigation";
import { Lab } from "./lab";

/* =========================================================================
   Banco de pruebas del Núcleo Vivo.

   Desarrollar la Apertura Neural dentro de la película es imposible: para
   ver un estado hay que llegar hasta su punto de scroll, y para comparar dos
   hay que recorrerla dos veces. Aquí están los once a un clic, con los
   mandos de cámara y luz sueltos.

   No sale a producción salvo que se pida a mano con NESPED_LAB=1. No expone
   ningún dato —es geometría y muelles— pero una ruta interna que aparece en
   Google es una ruta que alguien acaba enlazando.
   ========================================================================= */

export const metadata = {
  title: "Living Core",
  robots: { index: false, follow: false },
};

export default function Pagina() {
  const abierto = process.env.NODE_ENV !== "production" || process.env.NESPED_LAB === "1";
  if (!abierto) notFound();
  return <Lab />;
}
