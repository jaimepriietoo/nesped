import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Para que las pruebas puedan importar el código de verdad.
 *
 * El proyecto escribe `import { limitesDe } from "@/lib/planes"`. Ese `@/` lo
 * entiende Next y no lo entiende Node, así que hasta ahora las pruebas de
 * unidad hacían lo único que podían: copiar la función dentro del fichero de
 * prueba y comprobar la copia.
 *
 * Eso es peor que no tener prueba. Cuando alguien cambia el original, la copia
 * sigue pasando en verde y la prueba dice que todo está bien mientras el
 * código real hace otra cosa. Pasó de hecho con el contador de caracteres de
 * voz: el prefijo cambió y la copia no se enteró.
 *
 * Con este enganche, `@/` apunta a la raíz del proyecto y las pruebas importan
 * exactamente lo que se despliega. Solo se carga al ejecutar `npm test`; la
 * aplicación no lo ve.
 */

const RAIZ = path.resolve(import.meta.dirname, "..");

/* Next resuelve la extensión por su cuenta; Node no. Se prueban las mismas
   que usa el proyecto, en el mismo orden. */
const EXTENSIONES = ["", ".js", ".mjs", ".jsx", "/index.js", "/index.mjs"];

export async function resolve(especificador, contexto, siguiente) {
  if (!especificador.startsWith("@/")) return siguiente(especificador, contexto);

  const base = path.join(RAIZ, especificador.slice(2));

  for (const extension of EXTENSIONES) {
    const candidato = base + extension;
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
      return siguiente(pathToFileURL(candidato).href, contexto);
    }
  }

  /* Si no está, se deja seguir para que el error lo dé Node con su mensaje
     de siempre en vez de uno inventado aquí. */
  return siguiente(especificador, contexto);
}
