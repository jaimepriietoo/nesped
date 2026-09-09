import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Que ninguna pantalla quede fuera de la puerta.
 *
 * El proxy decide quién entra mirando el principio de la dirección: si empieza
 * por /portal o /admin, hace falta sesión. Todo lo demás es público, porque
 * todo lo demás es la web.
 *
 * Eso deja una trampa silenciosa: una página guardada en cualquier otro sitio
 * se sirve a quien la pida. Y pasó. Había una copia del panel de
 * administración en `app/api/admin/overview/page.js` —dentro de la carpeta de
 * la API, donde nadie espera encontrar una página— y su dirección real era
 * /api/admin/overview, que no empieza por /admin. Comprobado en producción:
 * /admin/overview mandaba al login y /api/admin/overview devolvía la página.
 *
 * Los datos no se escapaban, porque los pide el navegador a una ruta que sí
 * comprueba el permiso y contesta 401. Pero un desconocido veía el armazón del
 * panel de administración de Nesped en una dirección que se adivina sola.
 *
 * Esta prueba comprueba lo que el proxy da por hecho.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");

/** Páginas que son públicas a propósito: la web, el login, lo legal. */
const PUBLICAS = [
  "", "login", "registro", "precios", "legal", "gracias", "demo",
  "contacto", "blog", "casos", "producto", "soluciones", "recuperar",
  /* Alias en inglés de /precios. */
  "pricing",
  /* La ficha de una empresa por su enlace, para que pueda repartirlo. Pinta
     solo lo que devuelve formaPublica() en /api/clients: nombre y marca. */
  "c",
];

function paginas() {
  const salida = [];
  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === "node_modules") continue;
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      else if (/^page\.(js|jsx|tsx)$/.test(entrada.name)) salida.push(completa);
    }
  };
  recorrer(path.join(RAIZ, "app"));
  return salida;
}

/** La dirección pública de un fichero page.js, sin los grupos (entre paréntesis). */
function direccionDe(fichero) {
  return path
    .relative(path.join(RAIZ, "app"), fichero)
    .replace(/\/?page\.(js|jsx|tsx)$/, "")
    .split("/")
    .filter((tramo) => tramo && !tramo.startsWith("("))
    .join("/");
}

test("no hay páginas escondidas bajo app/api", () => {
  /* Cualquier cosa ahí dentro tiene una dirección que empieza por /api, y el
     proxy no protege /api: son rutas que comprueban el permiso ellas mismas y
     contestan 401. Una página no lo hace. */
  const coladas = paginas()
    .map((f) => path.relative(RAIZ, f))
    .filter((f) => f.startsWith("app/api/"));

  assert.deepEqual(coladas, [], `Estas páginas se sirven sin pasar por el proxy:\n  ${coladas.join("\n  ")}`);
});

test("toda pantalla con datos vive bajo /portal o /admin", () => {
  /* No es una comprobación de permisos, es de colocación: el proxy solo mira
     el primer tramo, así que estar en el sitio correcto ES el permiso. Lo que
     no esté aquí ni en la lista de públicas hay que mirarlo a mano. */
  const raras = paginas()
    .map(direccionDe)
    .filter((d) => {
      const primero = d.split("/")[0] || "";
      if (primero === "portal" || primero === "admin") return false;
      return !PUBLICAS.includes(primero);
    });

  assert.deepEqual(
    raras,
    [],
    "Estas pantallas no están ni bajo /portal ni bajo /admin ni declaradas públicas:\n  " +
      raras.join("\n  ") +
      "\n\nSi de verdad son públicas, añádelas a PUBLICAS. Si enseñan datos de alguien, muévelas."
  );
});
