/**
 * Sitemap. No había ninguno, así que un buscador tenía que adivinar la
 * estructura del sitio siguiendo enlaces.
 *
 * Sólo entra lo público: /portal, /admin y /c/[clientId] quedan fuera a
 * propósito —las dos primeras piden sesión y la tercera es la página de un
 * cliente concreto, que no debe salir en resultados de Nesped.
 */
const BASE = "https://nesped.com";

export default function sitemap() {
  const ahora = new Date();

  return [
    { url: `${BASE}/`, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: ahora, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/legal/voice-compliance`, lastModified: ahora, changeFrequency: "yearly", priority: 0.3 },
  ];
}
