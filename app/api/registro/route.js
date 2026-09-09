import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeUpsertClientSettings } from "@/lib/client-settings";
import { validarPassword } from "@/lib/server/passwords";
import { hashPassword, setAuthCookies } from "@/lib/server/auth";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

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

const PLANES_PUBLICOS = new Set(["starter", "pro"]);

function normalizarEmail(valor = "") {
  return String(valor || "").trim().toLowerCase();
}

function aIdentificador(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

async function identificadorLibre(supabase, semilla) {
  const base = aIdentificador(semilla) || "cliente";

  for (let i = 0; i < 20; i += 1) {
    const candidato = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("id", candidato)
      .maybeSingle();
    if (!data) return candidato;
  }

  return `${base}-${Date.now()}`;
}

export async function POST(req) {
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

    const cuerpo = await req.json().catch(() => ({}));
    const email = normalizarEmail(cuerpo.email);
    const password = String(cuerpo.password || "");
    const empresa = String(cuerpo.empresa || "").trim();
    const plan = String(cuerpo.plan || "starter").toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, message: "Escribe un correo válido." }, { status: 400 });
    }
    if (!empresa) {
      return NextResponse.json({ ok: false, message: "Falta el nombre de tu empresa." }, { status: 400 });
    }
    if (!PLANES_PUBLICOS.has(plan)) {
      return NextResponse.json({ ok: false, message: "Ese plan no se contrata por aquí." }, { status: 400 });
    }

    const revision = validarPassword(password, { email });
    if (!revision.ok) {
      return NextResponse.json({ ok: false, message: revision.message }, { status: 400 });
    }

    const supabase = getSupabase();

    /* Mismo mensaje exista o no la cuenta: si dijéramos "ese correo ya está
       registrado", cualquiera podría averiguar quién es cliente nuestro
       probando correos. Se le manda a entrar, que es lo que necesita hacer. */
    const { data: yaExiste } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (yaExiste) {
      return NextResponse.json(
        {
          ok: false,
          yaRegistrado: true,
          message: "Ese correo ya tiene cuenta. Entra con tu contraseña para continuar.",
        },
        { status: 409 }
      );
    }

    const clientId = await identificadorLibre(supabase, empresa);

    const { error: errorCliente } = await supabase.from("clients").insert({
      id: clientId,
      name: empresa,
      brand_name: empresa,
      owner_email: email,
      /* El plan que pretende contratar, todavía sin pagar. Quien decide si
         está activo es billing_status, nunca esta columna por sí sola. */
      plan,
      billing_status: "pendiente",
      is_active: true,
    });

    if (errorCliente) {
      throw new Error(errorCliente.message || "No se pudo crear la empresa");
    }

    const { error: errorAjustes } = await safeUpsertClientSettings(
      supabase,
      { client_id: clientId, weekly_report_email: email, daily_report_email: email },
      { onConflict: "client_id" }
    );
    if (errorAjustes) {
      throw new Error(errorAjustes.message || "No se pudo dejar lista la configuración");
    }

    const hash = hashPassword(password);

    const { error: errorUsuario } = await supabase.from("users").insert({
      email,
      password: hash,
      role: "client",
      client_id: clientId,
      created_at: new Date().toISOString(),
    });
    if (errorUsuario) {
      throw new Error(errorUsuario.message || "No se pudo crear el usuario");
    }

    const { error: errorPortal } = await supabase.from("portal_users").insert({
      client_id: clientId,
      email,
      full_name: empresa,
      role: "owner",
      password_hash: hash,
      is_active: true,
    });
    if (errorPortal) {
      throw new Error(errorPortal.message || "No se pudo crear el acceso al portal");
    }

    /* Se deja la sesión abierta: acaba de demostrar que sabe la contraseña
       poniéndola, y mandarle a la pantalla de acceso justo antes de pagar es
       una pérdida de gente por nada. El segundo factor entra en los accesos
       posteriores, que es donde protege de verdad. */
    await setAuthCookies({ email, role: "client", clientId, clientName: empresa });

    return NextResponse.json({
      ok: true,
      clientId,
      siguiente: `/api/suscripcion/iniciar?plan=${encodeURIComponent(plan)}`,
    });
  } catch (error) {
    console.error("POST /api/registro error:", error);
    return NextResponse.json(
      { ok: false, message: "No se pudo crear la cuenta. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
