"use client";

/* =========================================================================
   <NucleoVivo> — la Apertura Neural dentro de React.

   Regla que ordena todo este archivo: React monta la caja y decide QUÉ está
   haciendo Nesped; no participa en el CÓMO se pinta. El bucle de render lee
   objetos mutables y no dispara un solo repintado. Meter las magnitudes en
   useState sería renderizar el árbol sesenta veces por segundo para no
   cambiar ni un nodo del DOM.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { Respaldo } from "./respaldo";
import "./nucleo.css";

/* Qué está haciendo Nesped, en texto. Un estado que sólo existe como
   movimiento no existe para quien usa lector de pantalla. */
const DICHO = {
  DORMANT: "Nesped en reposo",
  IDLE: "Nesped disponible",
  LISTENING: "Nesped está escuchando",
  UNDERSTANDING: "Nesped está entendiendo lo que se le pide",
  THINKING: "Nesped está pensando",
  SPEAKING: "Nesped está respondiendo",
  ACTING: "Nesped está ejecutando una acción",
  SUCCESS: "Nesped ha terminado",
  ATTENTION: "Nesped necesita tu atención",
  ERROR: "Nesped ha encontrado un problema",
  HANDOFF: "Nesped está pasando la conversación a una persona",
};

function prefiereQuieto() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Nivel de calidad de partida.
 *
 * No se mide el equipo, se estima y luego se corrige sola: medir de verdad
 * exige renderizar primero, y arrancar en alta en un móvil de gama baja son
 * dos segundos de tirones justo en la primera impresión.
 */
function nivelInicial() {
  if (typeof navigator === "undefined") return "media";
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory || 4;
  const estrecho = window.matchMedia("(max-width: 820px)").matches;
  // Datos ahorrados: quien lo pide no quiere que le quememos la batería.
  if (navigator.connection?.saveData) return "baja";
  if (estrecho) return nucleos >= 6 && memoria >= 4 ? "media" : "baja";
  if (nucleos >= 8 && memoria >= 8) return "alta";
  if (nucleos >= 4) return "media";
  return "baja";
}

/**
 * @param {string} estado       uno de los once nombres de tokens.js
 * @param {object} controlRef   ref que se rellena con la API imperativa
 * @param {object} direccionRef ref con la cámara; si no se pasa, queda quieta
 * @param {boolean} atento      si sigue el puntero para tensar la superficie
 * @param {string} etiqueta     texto accesible; sin él, es decorativo
 */
export function NucleoVivo({
  estado = "IDLE",
  clase = "",
  controlRef,
  direccionRef,
  atento = false,
  etiqueta,
  alFallar,
}) {
  const caja = useRef(null);
  const lienzo = useRef(null);
  const motor = useRef(null);
  const maquina = useRef(null);
  /* Se parte de "sin respaldo" a propósito.

     Si arrancara en true, entre el primer pintado y el momento en que resuelve
     la carga diferida se vería un fotograma del SVG y otro del lienzo. En la
     portada eso es peor que no ver nada: la escena de apertura consiste
     precisamente en que durante un instante parezca que ahí no hay nada, y un
     parpadeo de otra versión del objeto la rompe. El respaldo aparece cuando
     se sabe que hace falta: sin WebGL, con movimiento reducido, o al fallar. */
  const [respaldo, setRespaldo] = useState(false);
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vivo = true;
    let soltar = () => {};

    if (prefiereQuieto()) {
      setQuieto(true);
      setRespaldo(true);
      return undefined;
    }

    /* Carga diferida de toda la capa WebGL.
       El shader, el renderer y la máquina son un trozo aparte del paquete:
       la portada tiene que poder pintar su texto sin esperar a nada de esto,
       y quien nunca llega a ver el núcleo no lo descarga. */
    Promise.all([import("./estado"), import("./gl/render")])
      .then(([mEstado, mRender]) => {
        if (!vivo || !lienzo.current) return;

        const maq = new mEstado.NucleoEstado(estado);
        const dir = direccionRef?.current || mRender.direccionInicial();
        if (direccionRef && !direccionRef.current) direccionRef.current = dir;

        const render = new mRender.NucleoRender(lienzo.current, {
          estado: maq,
          direccion: dir,
          nivel: nivelInicial(),
          alFallar: (e) => {
            setRespaldo(true);
            alFallar?.(e);
          },
        });

        if (!render.montar()) return;

        maquina.current = maq;
        motor.current = render;
        setRespaldo(false);

        if (controlRef) {
          controlRef.current = {
            ir: (n, o) => maq.ir(n, o),
            mezclar: (a, b, k) => maq.mezclar(a, b, k),
            oirVoz: (a) => maq.oirVoz(a),
            direccion: dir,
            maquina: maq,
            motor: render,
            get nivel() { return render.nivel; },
          };
        }

        /* Sólo en desarrollo. Tener el motor y la máquina a mano en la
           consola es lo que permite llevar a Nesped a un estado concreto y
           mirar el fotograma sin recorrer media portada para llegar. */
        if (process.env.NODE_ENV !== "production") {
          window.__nucleo = controlRef?.current || { maquina: maq, motor: render };
        }

        /* Se observa el lienzo, no la caja.

           La caja mide lo mismo esté o no el respaldo por encima, así que si
           se observara a ella el observador no volvería a dispararse nunca
           después del primer montaje. Y el primer montaje ocurre antes de que
           el navegador haya maquetado nada. */
        const ro = new ResizeObserver(() => render.redimensionar());
        ro.observe(lienzo.current);

        /* Fuera de pantalla no se pinta. Un raymarch a pantalla completa
           corriendo bajo tres scrolls de distancia es batería a cambio de
           nada. */
        const io = new IntersectionObserver(
          ([e]) => { render.visible = e.isIntersecting; },
          { rootMargin: "120px" }
        );
        io.observe(caja.current);

        /* IntersectionObserver no vuelve a dispararse cuando la pestaña pasa
           de oculta a visible: la geometría no ha cambiado, sólo la
           visibilidad del documento. Sin esto, volver a una pestaña dejaba a
           Nesped congelado en negro hasta el primer scroll. */
        const alVolver = () => {
          if (document.hidden || !caja.current) return;
          const r = caja.current.getBoundingClientRect();
          render.visible = r.bottom > -120 && r.top < window.innerHeight + 120;
          render.redimensionar();
        };
        document.addEventListener("visibilitychange", alVolver);

        /* Si el navegador tira el contexto —cambio de GPU, pestaña dormida,
           demasiados lienzos— se cae al respaldo en vez de dejar un rectángulo
           negro que nadie sabe interpretar. */
        const alPerder = (e) => { e.preventDefault(); setRespaldo(true); };
        lienzo.current.addEventListener("webglcontextlost", alPerder);

        soltar = () => {
          ro.disconnect();
          io.disconnect();
          document.removeEventListener("visibilitychange", alVolver);
          lienzo.current?.removeEventListener("webglcontextlost", alPerder);
          render.desmontar();
          motor.current = null;
          maquina.current = null;
          if (controlRef) controlRef.current = null;
        };
      })
      .catch((e) => {
        if (!vivo) return;
        setRespaldo(true);
        alFallar?.(e);
      });

    return () => { vivo = false; soltar(); };
    // El estado inicial sólo importa al montar; los cambios van por el efecto
    // de abajo, que no reconstruye nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    maquina.current?.ir(estado);
  }, [estado]);

  useEffect(() => {
    if (!atento) return undefined;
    /* Tensión, no seguimiento. Se guarda la posición normalizada y el shader
       la usa para engordar unas centésimas el lado por el que estás. Nesped
       no persigue el ratón: sabe que estás ahí. */
    const alMover = (e) => {
      const m = maquina.current;
      if (!m) return;
      m.mirarPuntero(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1)
      );
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    return () => window.removeEventListener("pointermove", alMover);
  }, [atento]);

  return (
    <div ref={caja} className={`nsp ${clase}`}>
      {/* El lienzo no se oculta con `hidden` aunque haya respaldo.

          Un lienzo en display:none mide cero, y montar WebGL contra un
          elemento de cero por cero deja un búfer de un píxel que ningún
          redimensionado posterior corrige, porque la caja de fuera nunca
          cambia de tamaño. Se queda debajo, en negro, que es el fondo. */}
      <canvas ref={lienzo} className="nsp-lienzo" />
      {respaldo ? <Respaldo estado={estado} quieto={quieto} /> : null}
      {etiqueta === undefined ? null : (
        <span className="nsp-dicho" role="status" aria-live="polite">
          {DICHO[estado] || DICHO.IDLE}
        </span>
      )}
    </div>
  );
}

export { nivelInicial, prefiereQuieto };
