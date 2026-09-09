/**
 * Desde qué dirección sale un correo de Nesped.
 *
 * Vive aquí porque estaba escrito en tres sitios y no coincidían: el segundo
 * factor y la bienvenida salían de `updates.nesped.com`, y los informes
 * diario y semanal de `reports@nesped.com`, que es OTRO dominio —la raíz, no
 * el subdominio—.
 *
 * Eso no es una inconsistencia estética. En Resend hay que verificar cada
 * dominio de envío, y mandar desde uno sin verificar no avisa en la interfaz:
 * simplemente no llega. Los informes podían llevar meses sin salir sin que
 * nadie lo notara, porque nadie echa de menos un correo que no sabe que
 * existe.
 *
 * Un solo sitio, y una variable de entorno para cambiarlo sin tocar código.
 */
export function remitenteNesped() {
  return process.env.RESEND_FROM || "Nesped <onboarding@updates.nesped.com>";
}
