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

/**
 * @param {(quien: "agente"|"cliente"|null) => void} alSonar
 *   Avisa de quién está hablando en cada momento. Lo usa la portada para que
 *   el núcleo escuche cuando habla el cliente y hable cuando habla el agente:
 *   el estado visual de Nesped no se inventa, sale de lo que está sonando.
 * @param {(amplitud: number) => void} alVibrar
 *   La fuerza de la voz en este instante, de cero a uno, sesenta veces por
 *   segundo. Con esto los pulsos de Nesped al hablar coinciden con lo que se
 *   oye en vez de seguir un ritmo inventado, que es toda la diferencia entre
 *   "palpita" y "está hablando".
 */
export function EscuchaLlamada({ alSonar, alVibrar }) {
  const audio = useRef(null);
  const onda = useRef(null);
  const analizador = useRef(null);
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

  /**
   * Engancha el análisis de la señal la primera vez que alguien pulsa.
   *
   * No antes: crear un contexto de audio sin que nadie lo haya pedido lo deja
   * suspendido en la mayoría de navegadores, y algunos lo cuentan como
   * reproducción automática. Después del primer gesto arranca sin pelea.
   */
  function engancharAnalisis() {
    if (analizador.current || !audio.current) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const fuente = ctx.createMediaElementSource(audio.current);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.72;
      fuente.connect(an);
      /* Y del analizador a los altavoces: en cuanto el elemento pasa por el
         grafo de audio, deja de sonar solo. */
      an.connect(ctx.destination);
      analizador.current = { ctx, an, datos: new Uint8Array(an.fftSize) };
    } catch {
      // Sin análisis se sigue oyendo igual: la onda es un extra, no el audio.
      analizador.current = null;
    }
  }

  function alternar() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setCargando(true);
      engancharAnalisis();
      analizador.current?.ctx.resume?.();
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

  /* Se avisa fuera de quién habla, no de cada milisegundo: el efecto sólo
     corre cuando cambia el turno o el reproductor arranca o para. */
  const quien = sonando && activa >= 0 ? GUION[activa].quien : null;
  useEffect(() => {
    alSonar?.(quien);
  }, [quien, alSonar]);

  /**
   * Dibuja la onda mientras suena.
   *
   * Es la señal de verdad, no una animación con forma de onda: se lee la
   * muestra del analizador en cada fotograma. Por eso los silencios son
   * silencios y las eses se ven. Y de paso sale de aquí la fuerza de la voz
   * que mueve los pulsos del núcleo.
   *
   * El bucle sólo existe mientras hay reproducción; al parar, se apaga.
   */
  useEffect(() => {
    if (!sonando) {
      alVibrar?.(-1);
      return undefined;
    }
    let raf = 0;
    const pintar = () => {
      raf = requestAnimationFrame(pintar);
      const lienzo = onda.current;
      const a = analizador.current;
      if (!lienzo || !a) return;

      a.an.getByteTimeDomainData(a.datos);

      const ancho = lienzo.clientWidth;
      const alto = lienzo.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (lienzo.width !== Math.round(ancho * dpr)) {
        lienzo.width = Math.round(ancho * dpr);
        lienzo.height = Math.round(alto * dpr);
      }

      const g = lienzo.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, ancho, alto);

      const barras = Math.max(24, Math.floor(ancho / 4));
      const porBarra = Math.floor(a.datos.length / barras);
      let suma = 0;

      for (let i = 0; i < barras; i += 1) {
        let pico = 0;
        for (let k = 0; k < porBarra; k += 1) {
          const v = Math.abs(a.datos[i * porBarra + k] - 128) / 128;
          if (v > pico) pico = v;
        }
        suma += pico;
        const h = Math.max(1, pico * alto * 0.92);
        const x = (i / barras) * ancho;
        /* Lo ya reproducido va en el verde de la marca y lo que queda, en
           gris: la onda hace también de barra de avance. */
        g.fillStyle = x / ancho <= avance / 100 ? "#7ee3bd" : "rgba(255,255,255,0.22)";
        g.fillRect(x, (alto - h) / 2, Math.max(1, ancho / barras - 1.6), h);
      }

      alVibrar?.(Math.min(1, (suma / barras) * 2.6));
    };
    raf = requestAnimationFrame(pintar);
    return () => { cancelAnimationFrame(raf); alVibrar?.(-1); };
  }, [sonando, avance, alVibrar]);

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
          {reloj(posicion)} / {reloj(duracion || 25)}
        </span>
      </div>

      {/* La onda real de lo que está sonando. Cuando no suena nada, queda el
          hueco vacío: dibujar una onda inventada en silencio sería mentir
          justo en la pieza que existe para demostrar que esto es verdad. */}
      <canvas ref={onda} className="v3-escucha-onda" aria-hidden="true" />

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
