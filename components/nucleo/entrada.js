"use client";

/* =========================================================================
   Nesped te abre la puerta.

   Un plano de una vez, al entrar al portal: el objeto en grande, en negro,
   pasando de comprobar a ejecutar, y después se retira y deja el panel
   montado detrás.

   Por qué existe y por qué dura tan poco. El salto del login al portal era
   un corte en blanco entre dos páginas distintas, y ahí se rompía la única
   cosa que sostiene la identidad: que Nesped es el mismo en la portada, en
   la puerta y dentro. Esto lo cose. Pero un panel de trabajo no puede
   hacerte esperar para enseñarte una animación, así que:

   - el armazón se monta DEBAJO desde el primer fotograma, no después;
   - nada de esto captura el puntero, así que se puede escribir o pulsar
     mientras se retira;
   - dura 1,2 s y se desmonta, con lo que el contexto de WebGL se suelta y
     no queda un segundo lienzo corriendo por debajo del panel;
   - con movimiento reducido no aparece en absoluto.

   Y no se enseña en cada carga. Volver de una pestaña o refrescar por
   octava vez una pantalla de contactos no es "entrar": se recuerda en la
   sesión del navegador que ya ha pasado.
   ========================================================================= */

import { useEffect, useState } from "react";
import { NucleoMarca } from "./marca";
import "./entrada.css";

const CLAVE = "nesped:entrada";
const DURACION = 1200;

/* La decisión se toma una vez por carga de página y se recuerda aquí.

   Hace falta porque React invoca los efectos DOS VECES en desarrollo, a
   propósito, para destapar justo esta clase de fallo: la primera pasada
   marcaba en sessionStorage que el plano ya se había visto, y la segunda
   encontraba la marca puesta y decidía no enseñarlo. Resultado: no se veía
   nunca en desarrollo y sí en producción, que es la peor manera de tener un
   fallo. Cacheando la decisión, las dos pasadas responden lo mismo. */
let decision = null;

/** Si corresponde enseñar el plano de entrada en esta carga. */
function toca() {
  if (decision !== null) return decision;
  if (typeof window === "undefined") return false;

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    decision = false;
    return decision;
  }

  try {
    /* Y no se enseña en cada carga. Volver de una pestaña o refrescar por
       octava vez una pantalla de contactos no es "entrar". */
    decision = !sessionStorage.getItem(CLAVE);
    sessionStorage.setItem(CLAVE, "1");
  } catch {
    /* Sin almacenamiento —modo privado, permisos— se enseña y ya está: es
       preferible repetirlo a que reviente la pantalla por un guardado. */
    decision = true;
  }

  return decision;
}

/*
 * Aquí no va el nombre de la empresa, y no es un detalle de implementación:
 * este plano es Nesped abriendo la puerta, y la marca del cliente es lo que
 * hay DETRÁS de la puerta. Ponerla en los dos sitios a la vez duplicaba el
 * mismo nombre en pantalla —y en el árbol de accesibilidad— durante segundo
 * y pico.
 */
export function EntradaNesped() {
  /* Arranca en false y decide en el efecto, no al renderizar: `toca()` mira
     sessionStorage y el ajuste de movimiento, y ninguna de las dos cosas
     existe en el servidor. Decidiéndolo al renderizar, el HTML del servidor
     y el del cliente no coincidirían y React tiraría la hidratación entera. */
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    if (!toca()) return undefined;
    /* Encenderlo en el fotograma siguiente y no aquí mismo: cambiar el estado
       en el cuerpo del efecto obliga a React a volver a renderizar antes de
       pintar, y además es lo que marca la regla de los hooks. El fotograma
       que se pierde son ocho milisegundos sobre un panel que todavía está
       enseñando su esqueleto. */
    const primero = requestAnimationFrame(() => setVisible(true));
    const irse = setTimeout(() => setSaliendo(true), DURACION - 420);
    const fuera = setTimeout(() => setVisible(false), DURACION);
    return () => {
      cancelAnimationFrame(primero);
      clearTimeout(irse);
      clearTimeout(fuera);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="nsp-entrada" data-saliendo={saliendo ? "1" : "0"} aria-hidden="true">
      <div className="nsp-entrada-nucleo">
        <NucleoMarca estado={saliendo ? "ACTING" : "THINKING"} tam={190} />
      </div>
      <p className="nsp-entrada-dice">
        <b>Nesped</b>
        <span>Abriendo tu panel</span>
      </p>
    </div>
  );
}
