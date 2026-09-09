import { getPortalContext } from "@/lib/portal-auth";
import { evaluarInteligencia } from "@/lib/server/inteligencia";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

/**
 * Preguntarle a Nesped.
 *
 * La decisión que define esto: el modelo NO ve la base de datos. Ve lo que los
 * módulos de inteligencia ya han calculado, con sus cifras y sus métodos, y su
 * trabajo es redactar con eso. Nada más.
 *
 * Es a propósito y es la diferencia entre una herramienta y un adivino. Si le
 * damos acceso a las tablas, ante "¿por qué hemos vendido menos?" va a
 * encontrar una explicación siempre, porque para eso está entrenado: los
 * números que no cuadren los redondeará, los que falten los estimará, y el
 * resultado sonará convincente. Atado a los módulos, cuando no hay datos sólo
 * puede decir que no los hay.
 *
 * Efecto secundario que importa: el copiloto y el panel no pueden dar cifras
 * distintas para lo mismo, porque salen del mismo cálculo.
 */

const MODELO = process.env.OPENAI_COPILOTO_MODEL || "gpt-5-mini";

function describirParaElModelo(estado) {
  const activos = estado.modulos.filter((m) => m.disponible);
  const dormidos = estado.modulos.filter((m) => !m.disponible);

  const lineas = [];

  lineas.push("DATOS DISPONIBLES (calculados, no estimados):");
  if (!activos.length) {
    lineas.push("  Ninguno. Esta cuenta todavía no tiene datos suficientes para ningún análisis.");
  }
  for (const m of activos) {
    lineas.push(`  - ${m.titulo}: ${m.valor}${m.unidad || ""}. ${m.resumen}`);
    lineas.push(`    Cómo se calcula: ${m.metodo}`);
    if (m.items?.length) {
      lineas.push(`    Detalle: ${JSON.stringify(m.items.slice(0, 10))}`);
    }
  }

  lineas.push("");
  lineas.push("ANÁLISIS QUE NO SE PUEDEN HACER TODAVÍA, Y QUÉ LES FALTA:");
  for (const m of dormidos) {
    lineas.push(`  - ${m.titulo}: ${m.falta}`);
  }

  lineas.push("");
  lineas.push("FUENTES DE DATOS:");
  for (const f of estado.fuentes) {
    lineas.push(`  - ${f.nombre}: ${f.estado}${f.detalle ? ` (${f.detalle})` : ""}`);
  }

  return lineas.join("\n");
}

const INSTRUCCIONES = `Eres el copiloto de Nesped, dentro del panel de un negocio español.

Contestas ÚNICAMENTE con los datos que te doy abajo. No tienes acceso a nada más.

Reglas que no puedes saltarte:
- Si la respuesta no está en los datos, dilo claramente y di qué haría falta. Nunca estimes, deduzcas ni redondees hacia una cifra que no te han dado.
- No inventes cantidades, porcentajes, nombres ni fechas. Ni siquiera como ejemplo.
- Si te preguntan por algo que aparece en "análisis que no se pueden hacer todavía", explica exactamente qué falta.
- No digas que algo "causa" otra cosa: los datos son frecuencias observadas. Di "va asociado a", "coincide con".
- Nunca cites nombres de campos ni fragmentos del JSON. Traduce siempre a lenguaje normal: "lleva cinco días esperando", no "aparece con esperando: 120".
- Responde en español de España, tuteando, en dos o tres frases. Sin listas salvo que te pidan varias cosas.
- Nada de lenguaje de consultora: ni "sinergias", ni "optimizar", ni "accionable".`;

export async function POST(req) {
  try {
    const origenError = requireSameOrigin(req, "Origen no permitido");
    if (origenError) return origenError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    /* Cada pregunta cuesta una llamada al modelo, así que se limita por
       cuenta y no sólo por IP: una pestaña abierta en bucle vaciaría el
       presupuesto de todos. */
    const limiteError = await requireRateLimitAsync(req, {
      namespace: `copiloto:${ctx.clientId}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
      message: "Has hecho muchas preguntas seguidas. Prueba en un rato.",
    });
    if (limiteError) return limiteError;

    const { pregunta = "" } = await req.json().catch(() => ({}));
    const texto = String(pregunta).trim().slice(0, 500);

    if (!texto) {
      return Response.json({ success: false, message: "Escribe una pregunta." }, { status: 400 });
    }

    const estado = await evaluarInteligencia({
      supabase: ctx.supabase,
      clientId: ctx.clientId,
    });

    const activos = estado.modulos.filter((m) => m.disponible);

    /* Sin un solo análisis activo no se gasta una llamada al modelo para que
       redacte un "no sé". Se contesta directamente y se dice qué falta. */
    if (!activos.length) {
      return Response.json({
        success: true,
        respuesta:
          "Todavía no tengo ningún dato con el que responderte. En cuanto entren llamadas y contactos, esto empieza a funcionar.",
        sinDatos: true,
        basadoEn: [],
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        success: false,
        message: "El copiloto no está configurado en este entorno.",
      }, { status: 503 });
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const respuesta = await openai.responses.create({
      model: MODELO,
      instructions: INSTRUCCIONES,
      input: `${describirParaElModelo(estado)}\n\nPREGUNTA: ${texto}`,
    });

    return Response.json({
      success: true,
      respuesta: respuesta.output_text?.trim() || "No he sabido responder a eso.",
      /* Con qué ha contestado, para que se pueda comprobar. Una respuesta que
         no se puede verificar no vale más que una opinión. */
      basadoEn: activos.map((m) => ({ titulo: m.titulo, valor: `${m.valor}${m.unidad || ""}` })),
    });
  } catch (error) {
    console.error("POST /api/portal/copiloto error:", error);
    return Response.json(
      { success: false, message: "No he podido responder ahora mismo." },
      { status: 500 }
    );
  }
}
