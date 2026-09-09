/**
 * ¿Este contacto es de tu empresa?
 *
 * Existe porque el mismo fallo apareció en cuatro rutas seguidas —eventos,
 * notas, comentarios y recordatorios— y todas lo tenían por la misma razón:
 * pedían sesión y daban por hecho que con eso bastaba.
 *
 * "Está autenticado" y "tiene derecho a ESTE dato" son dos preguntas
 * distintas. La segunda se olvida porque la primera ya da la sensación de
 * haber cerrado la puerta, y el resultado es que cualquier cliente podía leer
 * el historial de los contactos de cualquier otro pasando su identificador
 * por la URL. Comprobado con una cuenta recién creada: seis eventos ajenos.
 *
 * Al ser una sola función, el día que haya que endurecer esto se endurece en
 * un sitio. Cuatro copias del mismo `eq("client_id", ...)` se corrigen tres
 * veces y media.
 */

/**
 * Devuelve true si el contacto existe y pertenece a esa empresa.
 *
 * No distingue entre "no existe" y "es de otro": desde fuera, ambas cosas
 * tienen que responder igual. Si respondieran distinto, probando
 * identificadores se podría averiguar cuáles existen en el sistema.
 */
export async function contactoEsDeLaEmpresa({ supabase, clientId, leadId }) {
  if (!supabase || !clientId || !leadId) return false;

  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("client_id", clientId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Comprobación lista para usar en una ruta: devuelve una respuesta 404 si el
 * contacto no es de la empresa, o null si todo está en orden.
 *
 * 404 y no 403 a propósito, por lo mismo de arriba: un 403 confirmaría que
 * ese contacto existe en otra empresa.
 */
export async function exigirContactoPropio({ supabase, clientId, leadId }) {
  if (!leadId) {
    return Response.json(
      { success: false, message: "Falta el contacto" },
      { status: 400 }
    );
  }

  const propio = await contactoEsDeLaEmpresa({ supabase, clientId, leadId });
  if (!propio) {
    return Response.json(
      { success: false, message: "No encontrado" },
      { status: 404 }
    );
  }

  return null;
}
