/**
 * Convierte un valor en una celda CSV que Excel no interpreta como fórmula.
 * El apóstrofo forma parte del valor mostrado por el parser CSV, pero Excel
 * lo usa como marcador de texto y no ejecuta lo que viene detrás.
 */
export function campoCsvSeguro(valor) {
  const texto = String(valor ?? "");
  const formula = /^[=+\-@\t\r\n]/.test(texto) || /^[ \u00a0]+[=+\-@]/.test(texto);
  const seguro = formula ? `'${texto}` : texto;

  if (/[",\n\r]/.test(seguro)) {
    return `"${seguro.replace(/"/g, '""')}"`;
  }
  return seguro;
}
