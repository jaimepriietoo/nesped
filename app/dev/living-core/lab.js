"use client";

import { useEffect, useRef, useState } from "react";
import { NucleoVivo } from "@/components/nucleo/nucleo";
import { NOMBRES_ESTADO } from "@/components/nucleo/tokens";
import "./lab.css";

/* Los mandos del director. Son los mismos uniformes que mueve la película:
   si algo se puede tocar aquí, se puede contar allí. */
const MANDOS = [
  { k: "revelado", min: 0, max: 1, paso: 0.01, ayuda: "0 = oscuridad; 1 = luz plena" },
  { k: "barrido", min: 0, max: 6.28, paso: 0.01, ayuda: "ángulo de la luz clave" },
  { k: "dentro", min: 0, max: 1, paso: 0.01, ayuda: "cuánto hemos atravesado la apertura" },
  { k: "replica", min: 0, max: 1, paso: 0.01, ayuda: "despliegue en profundidad" },
  { k: "fov", min: 0.25, max: 1.6, paso: 0.01, ayuda: "campo de visión" },
  { k: "distancia", min: 0.2, max: 7, paso: 0.01, ayuda: "cámara ↔ núcleo" },
];

export function Lab() {
  const control = useRef(null);
  const direccion = useRef(null);
  const [estado, setEstado] = useState("IDLE");
  const [valores, setValores] = useState({
    revelado: 1, barrido: 0.9, dentro: 0, replica: 0, fov: 0.62, distancia: 3.35,
  });
  const [nivel, setNivel] = useState("—");
  const [fps, setFps] = useState(0);

  /* Escribe en el objeto de dirección, no en el estado de React: es el mismo
     contrato que usa la landing. */
  useEffect(() => {
    const d = direccion.current;
    if (!d) return;
    d.deriva = true;
    d.revelado = valores.revelado;
    d.barrido = valores.barrido;
    d.dentro = valores.dentro;
    d.replica = valores.replica;
    d.fov = valores.fov;
    d.cam[2] = valores.distancia;
  }, [valores]);

  useEffect(() => {
    let n = 0;
    let t0 = performance.now();
    let raf = 0;
    const tic = () => {
      raf = requestAnimationFrame(tic);
      n += 1;
      const ahora = performance.now();
      if (ahora - t0 >= 1000) {
        setFps(Math.round((n * 1000) / (ahora - t0)));
        n = 0;
        t0 = ahora;
      }
    };
    raf = requestAnimationFrame(tic);

    /* El nivel y el motor se publican con un temporizador, no dentro del
       bucle de fotogramas: en una pestaña de fondo rAF no corre y entonces
       el panel no llegaba a decir nunca qué calidad se está usando. */
    const reloj = setInterval(() => setNivel(control.current?.nivel || "—"), 700);

    return () => { cancelAnimationFrame(raf); clearInterval(reloj); };
  }, []);

  return (
    <div className="lab">
      <div className="lab-escena">
        <NucleoVivo
          estado={estado}
          controlRef={control}
          direccionRef={direccion}
          atento
          etiqueta="Núcleo de Nesped"
        />
      </div>

      <aside className="lab-panel">
        <header>
          <b>LIVING CORE</b>
          <span>{fps} fps · calidad {nivel}</span>
        </header>

        <div className="lab-grupo">
          <span className="lab-tit">ESTADO</span>
          <div className="lab-estados">
            {NOMBRES_ESTADO.map((n) => (
              <button
                key={n}
                type="button"
                data-on={estado === n}
                onClick={() => setEstado(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-grupo">
          <span className="lab-tit">CÁMARA Y LUZ</span>
          {MANDOS.map((m) => (
            <label key={m.k} className="lab-mando">
              <span>{m.k}<i>{valores[m.k].toFixed(2)}</i></span>
              <input
                type="range"
                min={m.min}
                max={m.max}
                step={m.paso}
                value={valores[m.k]}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [m.k]: Number(e.target.value) }))
                }
              />
              <small>{m.ayuda}</small>
            </label>
          ))}
        </div>

        <div className="lab-grupo">
          <span className="lab-tit">SECUENCIAS</span>
          <button
            type="button"
            className="lab-secuencia"
            onClick={() => {
              /* La cadena completa: es la que tiene que entenderse sin texto.
                 Si mirándola aquí no se lee entrada → inteligencia → decisión
                 → acción → resultado, no está lista para la portada. */
              const pasos = [
                ["LISTENING", 2200], ["UNDERSTANDING", 1800], ["THINKING", 1500],
                ["SPEAKING", 2400], ["ACTING", 2600], ["SUCCESS", 1200], ["IDLE", 0],
              ];
              let acumulado = 0;
              pasos.forEach(([n, ms]) => {
                setTimeout(() => setEstado(n), acumulado);
                acumulado += ms;
              });
            }}
          >
            Mira a Nesped trabajar
          </button>
        </div>
      </aside>
    </div>
  );
}
