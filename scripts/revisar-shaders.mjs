/**
 * Los shaders viven dentro de literales de plantilla de JavaScript, así que un
 * acento grave escrito en un comentario del shader cierra el literal y rompe
 * el fichero entero. Ha pasado dos veces, y el error que sale señala una línea
 * de GLSL que no tiene nada malo, así que cuesta un rato entender qué pasa.
 *
 * Esto lo caza en un segundo: busca acentos graves dentro del cuerpo de cada
 * shader, saltándose las interpolaciones ${...}, que sí pueden llevarlos.
 */
import { readFileSync } from "node:fs";

const RUTA = new URL("../components/nucleo/gl/sombras.js", import.meta.url);
const texto = readFileSync(RUTA, "utf8");

/** Quita las interpolaciones, respetando llaves anidadas. */
function sinInterpolaciones(cuerpo) {
  let salida = "";
  for (let i = 0; i < cuerpo.length; i += 1) {
    if (cuerpo[i] === "$" && cuerpo[i + 1] === "{") {
      let nivel = 1;
      i += 2;
      while (i < cuerpo.length && nivel > 0) {
        if (cuerpo[i] === "{") nivel += 1;
        else if (cuerpo[i] === "}") nivel -= 1;
        // Se conservan los saltos de línea para no desajustar el recuento.
        if (cuerpo[i] === "\n") salida += "\n";
        i += 1;
      }
      i -= 1;
      continue;
    }
    salida += cuerpo[i];
  }
  return salida;
}

let fallos = 0;
let desde = 0;
let shaders = 0;

for (;;) {
  const abre = texto.indexOf("`#version 300 es", desde);
  if (abre === -1) break;

  const cuerpoCrudo = texto.slice(abre + 1);
  const limpio = sinInterpolaciones(cuerpoCrudo);
  const cierre = limpio.indexOf("`");
  if (cierre === -1) {
    console.error("Hay un shader que no llega a cerrarse.");
    fallos += 1;
    break;
  }

  const cuerpo = limpio.slice(0, cierre);
  if (!cuerpo.includes("void main()")) {
    console.error("Un shader no tiene main(): probablemente se cerró antes de tiempo.");
    fallos += 1;
  }

  shaders += 1;
  // El literal real termina más allá; se busca el cierre en el texto original.
  desde = abre + 1 + cuerpoCrudo.length - (cuerpoCrudo.length - cierre) + 1;
  const siguiente = texto.indexOf("`;", abre);
  desde = siguiente === -1 ? texto.length : siguiente + 2;
}

/* Y la comprobación de verdad: que el fichero se analiza como módulo. Si hay
   un acento grave suelto, esto revienta con el error exacto y su línea. */
const fuente = texto
  .replace(/^\s*import[\s\S]*?from\s+"[^"]+";$/gm, "")
  .replace(/^export /gm, "");
try {
  new Function(fuente);
} catch (e) {
  console.error("El fichero de shaders no se puede analizar:", e.message);
  console.error("Casi siempre es un acento grave escrito dentro de un shader.");
  fallos += 1;
}

if (fallos) process.exit(1);
console.log(`Shaders: ${shaders} revisados, bien.`);
