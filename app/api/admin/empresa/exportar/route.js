import { getSupabase } from "@/lib/supabase";
import { getAdminContext } from "@/lib/server/auth";
import { direccionParaEscuchar } from "@/lib/server/grabaciones";

/**
 * Sacar una empresa entera.
 *
 * POR QUÉ EXISTE, CON CINCO CLIENTES.
 *
 * La hoja de ruta pedía "repartir por fragmentos según empresa" para cuando
 * haya 200.000. Montar hoy una capa de enrutado sería complicar el producto a
 * cambio de nada.
 *
 * Pero repartir por fragmentos no es una capa de enrutado: es poder coger una
 * empresa y ponerla en otro sitio. Si eso se puede hacer limpiamente, repartir
 * es hacerlo muchas veces. Si no se puede, ninguna capa de enrutado lo
 * arregla. Y hace falta hoy por tres motivos que no tienen que ver con crecer:
 *
 *   · El RGPD da derecho a la portabilidad. Un cliente puede pedir sus datos.
 *   · Cuando un cliente se va, hay que poder entregárselos y borrarlos.
 *   · Y para saber si algo se puede repartir hay que intentarlo una vez.
 *
 * Va tabla a tabla y por trozos a propósito. Una empresa grande puede tener
 * cientos de miles de filas, y construir todo el documento en memoria es
 * exactamente el fallo que las fases 0 a 3 vinieron a quitar.
 */

/** Filas por trozo. Ver el comentario de exportar_tabla_de_empresa(). */
const POR_TROZO = 1000;

export async function GET(req) {
  const admin = await getAdminContext();
  if (!admin.ok) {
    return Response.json(
      { success: false, message: admin.message },
      { status: admin.status || 401 }
    );
  }

  const url = new URL(req.url);
  const empresa = url.searchParams.get("empresa");
  const tabla = url.searchParams.get("tabla");
  const desde = Number(url.searchParams.get("desde") || 0);

  if (!empresa) {
    return Response.json(
      { success: false, message: "Falta la empresa" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  /* Sin tabla se devuelve el inventario: qué hay y cuánto. Quien exporta lo
     recorre y va pidiendo tabla por tabla. Así se puede enseñar un progreso, y
     al terminar se puede comprobar que lo sacado cuadra con lo que había. */
  if (!tabla) {
    const { data, error } = await supabase.rpc("inventario_de_empresa", {
      p_client_id: empresa,
    });

    if (error) {
      return Response.json(
        { success: false, message: error.message || "No se pudo leer el inventario" },
        { status: 500 }
      );
    }

    if (!data?.existe) {
      return Response.json(
        { success: false, message: "Esa empresa no existe" },
        { status: 404 }
      );
    }

    /* Las grabaciones no están en ninguna tabla: viven en el depósito, en una
       carpeta por empresa. Una exportación que sólo saca filas se deja fuera
       las conversaciones, que suelen ser lo que más le importa a quien pide
       sus datos. */
    const { data: ficheros } = await supabase.storage
      .from("grabaciones")
      .list(empresa, { limit: 1000 });

    return Response.json({
      success: true,
      inventario: {
        ...data,
        grabaciones: (ficheros || []).length,
      },
    });
  }

  /* Las grabaciones se piden como si fueran una tabla más, para que quien
     exporta recorra una sola lista. Las direcciones caducan en diez minutos:
     hay que descargarlas mientras se exporta, no guardarlas para luego. */
  if (tabla === "grabaciones") {
    const { data: ficheros, error: errorLista } = await supabase.storage
      .from("grabaciones")
      .list(empresa, { limit: 1000, offset: Number.isFinite(desde) && desde > 0 ? desde : 0 });

    if (errorLista) {
      return Response.json(
        { success: false, message: errorLista.message || "No se pudo listar el depósito" },
        { status: 500 }
      );
    }

    const filas = [];
    for (const fichero of ficheros || []) {
      filas.push({
        nombre: fichero.name,
        bytes: fichero.metadata?.size ?? null,
        url: await direccionParaEscuchar(`${empresa}/${fichero.name}`),
      });
    }

    return Response.json({
      success: true,
      empresa,
      tabla: "grabaciones",
      desde: desde || 0,
      filas,
      siguiente: filas.length === 1000 ? (desde || 0) + 1000 : null,
    });
  }

  const { data, error } = await supabase.rpc("exportar_tabla_de_empresa", {
    p_client_id: empresa,
    p_tabla: tabla,
    p_limite: POR_TROZO,
    p_desde: Number.isFinite(desde) && desde > 0 ? desde : 0,
  });

  if (error) {
    /* El mensaje de la función dice si la tabla no es de empresa. Es
       información útil para quien exporta y no dice nada que un administrador
       no pueda ver de todos modos. */
    return Response.json(
      { success: false, message: error.message || "No se pudo exportar" },
      { status: 400 }
    );
  }

  const filas = data || [];

  return Response.json({
    success: true,
    empresa,
    tabla,
    desde: desde || 0,
    filas,
    /* Si vuelve el trozo entero, quedan más. */
    siguiente: filas.length === POR_TROZO ? (desde || 0) + POR_TROZO : null,
  });
}
