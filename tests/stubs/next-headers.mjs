/* Sustituto de next/headers para las pruebas de unidad.

   Muchos módulos del servidor importan lib/server/auth.js, que a su vez
   importa next/headers para leer cookies. Ese módulo sólo existe dentro de
   Next: en Node a secas no se resuelve, y una prueba que quiera tocar el
   post-call de ElevenLabs —que no usa cookies para nada— se caía al importar.

   Aquí no hay petición, así que no hay cookies ni cabeceras: lo que las
   pida recibe un almacén vacío. Si una prueba necesita de verdad una cookie,
   ése es el momento de mirar por qué un módulo de datos depende de ella. */
const vacio = { get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} };
export async function cookies() { return vacio; }
export async function headers() { return new Headers(); }
