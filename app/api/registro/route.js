import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import crypto from "node:crypto";
import { validarPassword } from "@/lib/server/passwords";
import { hashPassword, generateTwoFactorCode, setTwoFactorChallenge } from "@/lib/server/auth";
import { sendTwoFactorCode } from "@/lib/server/two-factor.mjs";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { RegistroPublico, validar } from "@/lib/server/esquemas";

/**
 * Alta de cuenta ANTES de pagar.
 *
 * El orden anterior era al revés: se pagaba en Stripe y sólo después se creaba
 * la cuenta, en /portal/setup-account, a partir del session_id. Eso deja tres
 * agujeros que no se arreglan con reintentos:
 *
 *   1. Quien pagaba y cerraba la pestaña antes de terminar el formulario se
 *      quedaba con el cargo hecho y sin cuenta. El dinero cobrado y el cliente
 *      sin nada, y nosotros sin forma de saberlo salvo mirando Stripe a mano.
 *   2. La cuenta se creaba con el correo que se hubiera tecleado en Stripe, que
 *      no tiene por qué ser el que la persona quiere para entrar.
 *   3. No había manera de recuperar un carrito abandonado: sin cuenta, no hay
 *      a quién escribir.
 *
 * Creando la cuenta primero, el pago es sólo un estado de algo que ya existe.
 * Si no llega a pagar, queda un cliente en "pendiente" al que se puede escribir.
 *
 * La cuenta nace SIN plan activo: `billing_status` en "pendiente" y el plan
 * anotado como el que se pretende contratar, no como el que se tiene.
 */

/* Enterprise no está: se habla antes de contratarlo. Dar a un programa
   permiso para escribir a clientes en nombre de una empresa no se activa
   desde una pantalla de pago sin conocer el caso. */
function aIdentificador(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

async function manejarPOST(req) {
  try {
    const origenError = requireSameOrigin(req, "Origen no permitido para el alta");
    if (origenError) return origenError;

    /* Un alta crea filas en la base de datos sin que nadie se haya autenticado
       todavía, así que es el sitio natural por donde inundar la tabla. */
    const limiteError = await requireRateLimitAsync(req, {
      namespace: "registro",
      limit: 5,
      windowMs: 60 * 60 * 1000,
      message: "Demasiadas altas seguidas desde aquí. Prueba en un rato.",
    });
    if (limiteError) return limiteError;

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(RegistroPublico, cuerpo.datos, { mensaje: "Datos de alta no válidos" });
    if (leido.respuesta) return leido.respuesta;
    const { email, password, empresa, plan } = leido.datos;

    const revision = validarPassword(password, { email });
    if (!revision.ok) {
      return NextResponse.json({ ok: false, message: revision.message }, { status: 400 });
    }

    const supabase = getSupabase();

    const clientId = `${aIdentificador(empresa) || "cliente"}-${crypto.randomUUID().slice(0, 8)}`;
    const { error: signupError } = await supabase.rpc("registrar_empresa_segura", {
      p_client: clientId, p_company: empresa, p_email: email, p_password: hashPassword(password), p_plan: plan,
    });
    if (signupError) {
      return NextResponse.json({ ok: false, message: "No se pudo completar el alta. Si ya tienes cuenta, entra desde Acceder." }, { status: 400 });
    }

    // Escribir una contraseña no demuestra que el correo le pertenezca.
    const code = generateTwoFactorCode();
    await setTwoFactorChallenge({ email, role: "client", clientId, clientName: empresa,
      nextPath: `/api/suscripcion/iniciar?plan=${encodeURIComponent(plan)}`, code });
    await sendTwoFactorCode({ email, code, clientName: empresa, role: "owner" });

    return NextResponse.json({
      ok: true,
      clientId,
      siguiente: "/login?verificar=1",
    });
  } catch (error) {
    logErrorSeguro("auth.registro_failed", error);
    return NextResponse.json(
      { ok: false, message: "No se pudo crear la cuenta. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.registro.post", manejarPOST);
