/**
 * Datos legales de la empresa, en un solo sitio.
 *
 * Los textos legales los exige la ley española: el aviso legal por la LSSI
 * (artículo 10) y la política de privacidad por el RGPD. Ambos obligan a
 * identificar con exactitud a quién se está contratando.
 *
 * Esos datos NO se inventan. Aquí están vacíos a propósito, y mientras lo
 * estén las páginas legales lo dicen en alto en vez de enseñar un nombre
 * falso: un aviso legal con datos inventados es peor que no tenerlo, porque
 * induce a error sobre con quién se contrata.
 *
 * Para completarlo hay que rellenar este fichero y desplegar. Nada más.
 */

export const EMPRESA = {
  /** Nombre fiscal completo. Ej.: "Nesped Tecnología S.L." */
  razonSocial: "",
  /** NIF o CIF. */
  nif: "",
  /** Domicilio social completo, con código postal. */
  domicilio: "",
  /** Datos registrales, si es sociedad. Ej.: "Registro Mercantil de Valladolid, tomo …" */
  registro: "",

  /* Contacto. Estos sí son estables y no dependen del alta de la sociedad. */
  correo: "hola@nesped.com",
  correoPrivacidad: "privacidad@nesped.com",
  correoSoporte: "soporte@nesped.com",
  correoSeguridad: "seguridad@nesped.com",
  web: "https://nesped.com",
  marca: "Nesped",
};

/** ¿Están los datos que la ley exige nombrar? */
export function datosLegalesCompletos() {
  return Boolean(EMPRESA.razonSocial && EMPRESA.nif && EMPRESA.domicilio);
}

/**
 * Terceros que tratan datos por cuenta de Nesped.
 *
 * El RGPD obliga a informar de los encargados del tratamiento y de las
 * transferencias fuera del Espacio Económico Europeo. La lista sale de lo
 * que el producto usa de verdad, no de una plantilla.
 */
export const ENCARGADOS = [
  { nombre: "Supabase", para: "Base de datos y almacenamiento", donde: "Unión Europea (Irlanda)", fuera: false },
  { nombre: "Vercel", para: "Alojamiento de la web y del portal", donde: "Estados Unidos", fuera: true },
  { nombre: "Railway", para: "Servidor de voz en tiempo real", donde: "Estados Unidos", fuera: true },
  { nombre: "OpenAI", para: "Modelo de voz que atiende la llamada", donde: "Estados Unidos", fuera: true },
  { nombre: "Telnyx", para: "Telefonía, SMS y grabación", donde: "Estados Unidos", fuera: true },
  { nombre: "Stripe", para: "Cobro de suscripciones", donde: "Estados Unidos e Irlanda", fuera: true },
  { nombre: "Resend", para: "Correo transaccional y códigos de acceso", donde: "Estados Unidos", fuera: true },
  { nombre: "Sentry", para: "Registro de errores técnicos", donde: "Unión Europea (Alemania)", fuera: false },
];

/**
 * Cookies que la web deja de verdad.
 *
 * Todas son técnicas: sin ellas no se puede mantener la sesión. Las
 * estrictamente necesarias no requieren consentimiento previo, así que no
 * hay banner —y no ponerlo es lo correcto, no un descuido—, pero sí hay que
 * informar de cuáles son.
 */
export const COOKIES = [
  { nombre: "nesped_session", para: "Mantener la sesión iniciada. Va firmada y el navegador no puede leerla.", duracion: "7 días" },
  { nombre: "nesped_auth", para: "Marca de sesión activa.", duracion: "7 días" },
  { nombre: "nesped_client_id", para: "A qué cuenta pertenece la sesión.", duracion: "7 días" },
  { nombre: "nesped_client_name", para: "Nombre de la cuenta, para mostrarlo en el portal.", duracion: "7 días" },
  { nombre: "nesped_role", para: "Permisos de quien ha entrado.", duracion: "7 días" },
  { nombre: "nesped_user_email", para: "Identificar a la persona dentro de la cuenta.", duracion: "7 días" },
  { nombre: "nesped_login_challenge", para: "Verificación en dos pasos durante el acceso.", duracion: "10 minutos" },
];
