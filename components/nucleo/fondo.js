"use client";

/* =========================================================================
   Nesped de fondo.

   El mismo objeto de la portada ocupando el fondo de una pantalla entera, muy
   atrás y muy bajo de luz. No es un adorno con la forma del logo: es la
   Apertura Neural de verdad, con su geometría, su material y sus once
   estados, así que lo que hace mientras esperas dice algo.

   Sustituye a lo que había en /login y /registro, que era un vídeo de archivo
   servido desde un CDN ajeno. Un vídeo genérico detrás del formulario no es
   identidad —lo puede poner cualquiera, y de hecho lo pone cualquiera—,
   cuesta descargar y no sabe nada de lo que está pasando en la pantalla.
   Esto sí: mientras escribes, Nesped escucha; mientras comprueba la
   contraseña, piensa; si la contraseña no vale, se desestabiliza.

   Va detrás del contenido y no captura el puntero, así que no puede
   estorbar a un formulario. Y si no hay WebGL —o si lo dibujaría la CPU, o
   si el sistema pide movimiento reducido— NucleoVivo cae solo a la silueta
   en SVG, que es el mismo objeto quieto.
   ========================================================================= */

import { useRef } from "react";
import { NucleoVivo } from "./nucleo";
import { direccionInicial } from "./tokens";
import "./fondo.css";

/**
 * @param {string} estado    uno de los once de tokens.js
 * @param {number} luz       0–1, cuánto se deja ver. Detrás de un formulario
 *                           quiere ser poco: lo que se lee es el formulario.
 * @param {string} sitio     "centro" | "izquierda". El desplazamiento lo hace
 *                           el CSS con un transform y no la cámara: mover la
 *                           mirada cambia también la perspectiva del objeto, y
 *                           aquí lo único que hace falta es correrlo de sitio.
 */
export function FondoNesped({ estado = "IDLE", luz = 0.5, sitio = "centro" }) {
  const direccion = useRef(null);

  if (direccion.current == null) {
    const d = direccionInicial();
    /* Centrado y grande, con la tarjeta cayendo dentro de su vacío: se entra
       al portal por la apertura. Descentrarlo dejaba el objeto cortado contra
       un borde, que es lo contrario de lo que hace falta aquí. */
    d.cam[2] = 2.35;
    d.fov = 1.02;
    d.mira[0] = 0;
    d.mira[1] = 0;
    /* Sin fondo: el lienzo va con alfa y se mezcla con el negro de la página.
       Con fondo se vería el rectángulo. */
    d.fondo = 0;
    /* Nadie dirige esta cámara, así que se mueve sola. Son unas centésimas en
       media vuelta de minuto: lo justo para que la silueta cambie y el ojo lo
       lea como algo presente en vez de como una imagen puesta detrás. */
    d.deriva = true;
    direccion.current = d;
  }

  return (
    <div className="nsp-fondo" data-sitio={sitio} style={{ "--luz": luz }} aria-hidden="true">
      <NucleoVivo estado={estado} direccionRef={direccion} clase="nsp-fondo-nucleo" />
    </div>
  );
}
