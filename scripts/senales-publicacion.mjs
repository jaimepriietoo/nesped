/**
 * Qué hace que una migración no pueda publicarse en el repositorio, que es
 * público. Lo usa scripts/volcar-migraciones.mjs y lo comprueban las pruebas:
 * una migración que dispare una de estas señales sin llevar datos de nadie se
 * quedaría fuera del histórico en silencio.
 */

/**
 * El número de voz de Nesped ya está en lib/clients.js, que se publica. No es
 * exposición nueva y no debe disparar el filtro.
 */
const YA_PUBLICO = new Set(["+34983460825", "34983460825"]);

/** Qué hace que un fichero no pueda publicarse. */
const SENALES = [
  {
    nombre: "una dirección de correo",
    // Se excluyen los dominios de ejemplo, que existen justo para esto.
    prueba: (sql) =>
      [...sql.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)]
        .map((m) => m[0])
        .filter((c) => !/@(ejemplo|example)\.(invalid|com|org)$/i.test(c)),
  },
  {
    nombre: "un teléfono",
    prueba: (sql) =>
      [...sql.matchAll(/\+?34\d{9}/g)].map((m) => m[0]).filter((t) => !YA_PUBLICO.has(t)),
  },
  {
    nombre: "algo que parece una clave o un hash",
    // Cadenas largas sin espacios dentro de comillas simples: hashes de scrypt,
    // tokens, claves. Un identificador normal no llega a 40 caracteres.
    // Las direcciones públicas de la propia web no son secretos: el latido de
    // la cola (pg_cron) llama a una, y sin esto su migración no se publicaría.
    prueba: (sql) =>
      [...sql.matchAll(/'([A-Za-z0-9+/=$:._-]{40,})'/g)]
        .map((m) => m[1])
        .filter((v) => !/^[a-z_]+$/i.test(v))
        .filter((v) => !/^https:\/\/www\.nesped\.com\/api\/[a-z/-]+$/.test(v)),
  },
];

export function loQueNoSePuedePublicar(sql) {
  const motivos = [];
  for (const senal of SENALES) {
    const encontrado = senal.prueba(sql);
    if (encontrado.length > 0) motivos.push(`${senal.nombre} (${encontrado.length})`);
  }
  return motivos;
}
