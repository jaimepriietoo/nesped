"use client";

import { useEffect, useRef, useState } from "react";

/* =========================================================================
   Reproductor de la llamada de muestra.

   Es la pieza que más convence de toda la web: para un producto de voz, oírlo
   vale más que cualquier párrafo. Antes lo único que había era un formulario
   que pedía tu teléfono y te llamaba —muchísima fricción, y sólo funciona si
   quien mira está dispuesto a dar su número.

   El audio no se descarga hasta que alguien pulsa: con preload="none" la
   portada no carga casi un mega que la mayoría no va a escuchar.

   La transcripción no es decorativa: se resalta la línea que suena, sirve a
   quien no puede poner sonido en ese momento y hace la muestra accesible a
   quien no oye.
   ========================================================================= */

/*
 * El guion y sus tiempos los escribe el generador del audio.
 *
 * Estaban a mano y eso obliga a recalcularlos cada vez que se regenera la
 * llamada; en cuanto se olvida una vez, la línea resaltada va por detrás de
 * lo que suena y queda peor que no resaltar nada. Ahora salen del mismo
 * script que produce el WAV, así que no pueden desincronizarse.
 */
import GUION from "./muestra-guion.json";

function reloj(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function EscuchaLlamada() {
  const audio = useRef(null);
  const [sonando, setSonando] = useState(false);
  const [posicion, setPosicion] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const el = audio.current;
    if (!el) return undefined;

    const alAvanzar = () => setPosicion(el.currentTime);
    const alCargar = () => { setDuracion(el.duration || 0); setCargando(false); };
    const alTerminar = () => { setSonando(false); setPosicion(0); };

    el.addEventListener("timeupdate", alAvanzar);
    el.addEventListener("loadedmetadata", alCargar);
    el.addEventListener("ended", alTerminar);
    el.addEventListener("waiting", () => setCargando(true));
    el.addEventListener("playing", () => setCargando(false));

    return () => {
      el.removeEventListener("timeupdate", alAvanzar);
      el.removeEventListener("loadedmetadata", alCargar);
      el.removeEventListener("ended", alTerminar);
    };
  }, []);

  function alternar() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setCargando(true);
      el.play().then(() => setSonando(true)).catch(() => setCargando(false));
    } else {
      el.pause();
      setSonando(false);
    }
  }

  function saltarA(segundos) {
    const el = audio.current;
    if (!el) return;
    el.currentTime = segundos;
    if (el.paused) alternar();
  }

  // Índice de la línea que suena: la última cuyo inicio ya ha pasado.
  const activa = GUION.reduce((acc, l, i) => (posicion + 0.15 >= l.t ? i : acc), -1);
  const avance = duracion ? (posicion / duracion) * 100 : 0;

  return (
    <div className="v3-escucha">
      {/* preload="none": el audio sólo baja si alguien pulsa. */}
      <audio ref={audio} src="/muestra-llamada.wav" preload="none" />

      <div className="v3-escucha-cabecera">
        <button
          type="button"
          className="v3-escucha-play"
          onClick={alternar}
          aria-label={sonando ? "Pausar la llamada" : "Escuchar la llamada"}
        >
          {cargando ? (
            <span className="v3-escucha-cargando" aria-hidden="true" />
          ) : sonando ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.4" height="14" rx="1.2" /><rect x="13.6" y="5" width="3.4" height="14" rx="1.2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.7.7 0 0 0 1.07.6l11-6.8a.7.7 0 0 0 0-1.2l-11-6.8A.7.7 0 0 0 8 5.2z" /></svg>
          )}
        </button>

        <div className="v3-escucha-info">
          <span className="v3-card-meta">Llamada real del agente</span>
          <p className="v3-p" style={{ marginTop: 4 }}>
            Ninguna de las dos voces es una persona.
          </p>
        </div>

        <span className="v3-escucha-tiempo">
          {reloj(posicion)} / {reloj(duracion || 40)}
        </span>
      </div>

      <div
        className="v3-escucha-barra"
        role="progressbar"
        aria-label="Avance de la llamada"
        aria-valuenow={Math.round(avance)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${avance}%` }} />
      </div>

      <ol className="v3-escucha-guion">
        {GUION.map((l, i) => (
          <li key={l.t} data-quien={l.quien} data-activa={i === activa}>
            <button type="button" onClick={() => saltarA(l.t)}>
              <span className="v3-escucha-quien">{l.quien === "agente" ? "Nesped" : "Cliente"}</span>
              {l.texto}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
