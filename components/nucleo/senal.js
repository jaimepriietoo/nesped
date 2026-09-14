import { CONCEPTOS } from "./actos";

const acotar = (v) => Math.max(0, Math.min(1, v));
const suave = (v) => { const x = acotar(v); return x * x * (3 - 2 * x); };

/** La misma curva pasa de voz a contexto. Sólo depende del scroll: reversible. */
export function curvaSenal(p, capa = 0, pasos = 64) {
  const comprender = suave((p - 0.30) / 0.16);
  const recordar = suave((p - 0.47) / 0.10);
  const resolver = suave((p - 0.57) / 0.08);
  const fase = p * 68;
  const puntos = [];
  for (let i = 0; i <= pasos; i += 1) {
    const u = i / pasos;
    const ventana = Math.sin(u * Math.PI);
    const onda = Math.sin(u * 48 - fase) * Math.sin(u * 17 + fase * 0.3);
    const xVoz = 90 + u * 820;
    const yVoz = 240 + onda * ventana * (44 + capa * 8);
    const ang = u * Math.PI * 2 + capa * 0.34 + p * 3;
    const radio = 122 + capa * 32 + recordar * 24;
    const xContexto = 500 + Math.cos(ang) * radio * 1.5;
    const yContexto = 240 + Math.sin(ang) * radio * (0.46 + recordar * 0.26)
      + Math.cos(ang) * (capa - 1) * 22;
    let x = xVoz + (xContexto - xVoz) * comprender;
    let y = yVoz + (yContexto - yVoz) * comprender;
    x += (500 + u * 350 - x) * resolver;
    y += (240 + u * u * (90 + capa * 24) - y) * resolver;
    puntos.push(`${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return puntos.join(" ");
}

export function SenalContinua({ referencia }) {
  return (
    <svg ref={referencia} className="pel-senal" viewBox="0 0 1000 600" aria-hidden="true" data-visible="0">
      {[0, 1, 2].map((i) => (
        <g key={i} style={{ "--capa": i }}>
          <path data-curva={i} className="pel-senal-base" />
          <path data-curva={i} className="pel-senal-flujo" pathLength="100" />
        </g>
      ))}
      {CONCEPTOS.slice(0, 3).map((c, i) => (
        <g key={c.t} data-significado={i}>
          <circle r="3" />
          <text y="-13" textAnchor="middle">{c.t}</text>
        </g>
      ))}
    </svg>
  );
}

export function pintarSenal(svg, p) {
  if (!svg) return;
  const visible = p > 0.18 && p < 0.65;
  const valor = visible ? "1" : "0";
  if (svg.dataset.visible !== valor) svg.dataset.visible = valor;
  if (!visible) return;
  const clave = p.toFixed(4);
  if (svg.dataset.avance === clave) return;
  svg.dataset.avance = clave;
  const fuerza = suave((p - 0.18) / 0.035) * (1 - suave((p - 0.61) / 0.04));
  svg.style.setProperty("--presencia", fuerza.toFixed(3));
  const curvas = svg.__curvas || (svg.__curvas = [...svg.querySelectorAll("[data-curva]")]);
  for (let i = 0; i < 3; i += 1) {
    const d = curvaSenal(p, i);
    curvas[i * 2].setAttribute("d", d);
    curvas[i * 2 + 1].setAttribute("d", d);
  }
  const conceptos = svg.__conceptos || (svg.__conceptos = [...svg.querySelectorAll("[data-significado]")]);
  conceptos.forEach((el, i) => {
    const avance = suave((p - 0.37 - i * 0.018) / 0.055);
    const salida = suave((p - 0.54) / 0.055);
    const ang = i * 2.094 + p * 3;
    const x = 500 + Math.cos(ang) * (220 - salida * 110);
    const y = 240 + Math.sin(ang) * 125;
    el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    el.style.opacity = (avance * (1 - salida)).toFixed(3);
  });
}
