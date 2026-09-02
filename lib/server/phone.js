/**
 * Normalización de teléfonos a E.164.
 *
 * Necesaria porque "+34 983 460 825", "34983460825", "0034983460825" y
 * "983 460 825" son el mismo número pero como texto son cuatro cadenas
 * distintas. Sin normalizar, el enrutado de llamadas por número (buscar qué
 * cliente tiene asignado un twilio_number) falla según cómo se haya
 * tecleado el número al dar de alta al cliente.
 */

const PAIS_POR_DEFECTO = "34";
const LONGITUD_NACIONAL_ES = 9;

/** Devuelve el número en E.164 (`+` seguido de dígitos) o "" si no hay nada aprovechable. */
export function toE164(value, paisPorDefecto = PAIS_POR_DEFECTO) {
  const bruto = String(value ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/^tel:/i, "")
    .trim();

  if (!bruto) return "";

  const tienePlus = bruto.startsWith("+");
  let digitos = bruto.replace(/\D/g, "");
  if (!digitos) return "";

  if (tienePlus) return `+${digitos}`;
  if (digitos.startsWith("00")) return `+${digitos.slice(2)}`;
  if (digitos.length === LONGITUD_NACIONAL_ES) return `+${paisPorDefecto}${digitos}`;
  return `+${digitos}`;
}

/** true solo si ambos son teléfonos válidos y coinciden en su forma canónica. */
export function mismoTelefono(a, b) {
  const ea = toE164(a);
  const eb = toE164(b);
  return Boolean(ea) && ea === eb;
}

/** ¿Tiene pinta de número real? E.164 con 8 a 15 dígitos tras el +. */
export function esTelefonoValido(value) {
  const e = toE164(value);
  return /^\+\d{8,15}$/.test(e);
}

export const normalizePhone = toE164;
