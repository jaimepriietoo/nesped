"use client";

/* =========================================================================
   Tipografía que la descubre la luz.

   El mismo principio que el objeto: nada aparece con opacidad, lo revela un
   frente de luz que lo recorre. Aquí ese frente va palabra por palabra en vez
   de barrer la línea entera de una vez.

   La diferencia importa más de lo que parece. Un barrido único sobre todo el
   titular se lee como un degradado moviéndose por encima del texto; palabra a
   palabra se lee como algo que va APARECIENDO, porque cada una tiene su propio
   momento y el ojo las va cogiendo en orden, igual que al leer.
   ========================================================================= */

/**
 * @param {string} texto     lo que se escribe; los saltos de línea van con \n
 * @param {string} clase     clase del bloque (pel-h1, pel-h2, pel-palabra…)
 * @param {string} como      etiqueta a usar: h1, h2, p…
 */
/**
 * Parte el texto en líneas y palabras, y numera las palabras de corrido.
 *
 * Vive fuera del componente y sin mutar nada: el numerado tiene que dar lo
 * mismo cada vez que React vuelva a pintar, y un contador que se va sumando
 * mientras se recorre no lo garantiza.
 */
function repartir(texto) {
  const lineas = texto.split("\n").map((linea) => linea.split(" ").filter(Boolean));
  let desde = 0;
  const numeradas = [];
  for (const linea of lineas) {
    numeradas.push(linea.map((palabra, k) => ({ palabra, indice: desde + k })));
    desde += linea.length;
  }
  return { lineas: numeradas, total: desde };
}

export function Revelado({ texto, clase = "", como: Tag = "p", ...resto }) {
  const { lineas, total } = repartir(texto);

  return (
    <Tag className={`pel-rev ${clase}`} style={{ "--n": total }} {...resto}>
      {lineas.map((palabras, l) => (
        <span key={l} className="pel-rev-linea">
          {palabras.map(({ palabra, indice }) => (
            <span key={indice} className="pel-rev-pal" style={{ "--i": indice }}>
              {palabra}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}
