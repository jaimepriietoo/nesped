"use client";

/* =========================================================================
   El Núcleo Vivo dentro del producto.

   La versión pequeña y contenida de la Apertura Neural. Misma geometría,
   mismo material, mismos once estados: lo único que cambia es que aquí la
   cámara no se mueve nunca y el objeto ocupa unas decenas de píxeles.

   Dos reglas que vienen de la landing y aquí importan más:

   1. No se pone de adorno en todas las pantallas. Nesped tiene que tener
      presencia, no saturación, así que va donde de verdad está pasando algo.

   2. Su estado no se inventa. Se le pasa lo que está ocurriendo —cargando,
      error, algo pendiente de mirar— y él lo dice con el mismo lenguaje que
      en la portada. Un cliente que ha visto la web reconoce que está
      pensando sin leer una palabra.
   ========================================================================= */

import { useRef } from "react";
import { NucleoVivo } from "./nucleo";
import { Respaldo } from "./respaldo";
import { direccionInicial } from "./tokens";
import "./marca.css";

/* Por debajo de este tamaño no se monta WebGL.

   A cuarenta píxeles no hay diferencia visible entre el objeto marchado y su
   silueta en SVG —no caben ni el relieve ni los hilos— y en cambio sí hay
   diferencia en lo que cuesta: un contexto de WebGL y un bucle de render
   permanentes en una pantalla en la que lo que importa es que la tabla de
   contactos vaya instantánea. El producto es la prueba, no la película. */
const MINIMO_WEBGL = 96;

/**
 * @param {string} estado   uno de los once de tokens.js
 * @param {number} tam      lado en píxeles
 * @param {string} etiqueta texto accesible; sin él es decorativo
 */
export function NucleoMarca({ estado = "IDLE", tam = 40, etiqueta }) {
  const direccion = useRef(null);

  if (tam < MINIMO_WEBGL) {
    return (
      <span className="nsp-marca" style={{ "--tam": `${tam}px` }}>
        <Respaldo estado={estado} etiqueta={etiqueta} />
      </span>
    );
  }

  if (direccion.current == null) {
    const d = direccionInicial();
    // Un poco más cerca: en un disco de cuarenta píxeles el encuadre de la
    // portada deja el objeto en la mitad del hueco.
    d.cam[2] = 2.95;
    d.fov = 0.62;
    // Sin fondo: se mezcla en `screen` y cualquier valor se vería como disco.
    d.fondo = 0;
    direccion.current = d;
  }

  return (
    <span
      className="nsp-marca"
      style={{ "--tam": `${tam}px` }}
      /* En un icono de cuarenta píxeles el detalle fino no se ve y la marcha
         del volumen cuesta igual. La calidad la baja sola el vigilante si
         hace falta; lo que se hace aquí es no pedirle de entrada más de lo
         que cabe. */
    >
      <NucleoVivo
        estado={estado}
        etiqueta={etiqueta}
        direccionRef={direccion}
        clase="nsp-marca-nucleo"
      />
    </span>
  );
}

/**
 * Traduce lo que está pasando en una pantalla a un estado de Nesped.
 *
 * Vive aquí y no en cada vista para que "cargando" se vea igual en las nueve
 * pantallas del portal. Si esto se decidiera en cada sitio, dejaría de ser un
 * lenguaje y volvería a ser decoración.
 */
export function estadoDe({ error, cargando, atencion, actuando, hablando }) {
  if (error) return "ERROR";
  if (actuando) return "ACTING";
  if (hablando) return "SPEAKING";
  if (cargando) return "THINKING";
  if (atencion) return "ATTENTION";
  return "IDLE";
}
