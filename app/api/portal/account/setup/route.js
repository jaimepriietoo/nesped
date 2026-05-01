import { getPortalContext } from "@/lib/portal-auth";
import { safeUpsertClientSettings } from "@/lib/client-settings";
import { getSupabase } from "@/lib/supabase";
import {
  generateTwoFactorCode,
  hashPassword,
  requiresTwoFactor,
  setAuthCookies,
  setTwoFactorChallenge,
} from "@/lib/server/auth";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { sendTwoFactorCode } from "@/lib/server/two-factor.mjs";
import { stripe } from "@/lib/server/stripe-utils";

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function resolvePortalRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (["owner", "admin", "manager", "agent", "viewer"].includes(normalized)) {
    return normalized;
  }
  return "owner";
}

async function getPaidCheckoutSession(sessionId) {
  if (!sessionId) {
    throw new Error("Falta session_id de Stripe");
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (!session) {
    throw new Error("No se encontro la sesion de Stripe");
  }

  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw new Error("El pago todavia no esta completado");
  }

  return session;
}

async function generateClientId(supabase, seed) {
  const base = slugify(seed) || "cliente";

  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("id", candidate)
      .maybeSingle();

    if (!data) return candidate;
  }

  return `${base}-${Date.now()}`;
}

async function ensureClientForCheckout({ supabase, session, email }) {
  const metadataClientId = String(session.metadata?.client_id || "").trim();
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : "";

  if (metadataClientId) {
    const { data } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", metadataClientId)
      .maybeSingle();

    if (data) {
      return {
        id: data.id,
        name: data.name || data.id,
      };
    }
  }

  if (stripeCustomerId) {
    const { data } = await supabase
      .from("clients")
      .select("id,name")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (data) {
      return {
        id: data.id,
        name: data.name || data.id,
      };
    }
  }

  const clientName =
    String(session.customer_details?.name || "").trim() ||
    normalizeEmail(email).split("@")[0] ||
    "Cliente Nesped";
  const clientId = await generateClientId(supabase, clientName);

  const { error: clientError } = await supabase.from("clients").insert({
    id: clientId,
    name: clientName,
    owner_email: email,
    brand_name: clientName,
    stripe_customer_id: stripeCustomerId || null,
  });

  if (clientError) {
    throw new Error(clientError.message || "No se pudo crear el cliente");
  }

  const { error: settingsError } = await safeUpsertClientSettings(
    supabase,
    {
      client_id: clientId,
      weekly_report_email: email || null,
      daily_report_email: email || null,
    },
    { onConflict: "client_id" }
  );

  if (settingsError) {
    throw new Error(
      settingsError.message || "No se pudo crear la configuración inicial del cliente"
    );
  }

  return {
    id: clientId,
    name: clientName,
  };
}

async function upsertPortalAccess({
  supabase,
  clientId,
  clientName,
  currentEmail,
  email,
  password,
  role,
  fullName,
  phone,
  stripeCustomerId,
}) {
  const targetEmail = normalizeEmail(email);
  const sourceEmail = normalizeEmail(currentEmail || email);
  const hashedPassword = hashPassword(password);
  const emailCandidates = [...new Set([sourceEmail, targetEmail].filter(Boolean))];

  const { data: takenUser } = await supabase
    .from("users")
    .select("id,client_id")
    .eq("email", targetEmail)
    .maybeSingle();

  if (takenUser && takenUser.client_id !== clientId) {
    throw new Error("Ese email ya esta en uso por otro cliente");
  }

  let existingUser = null;
  if (emailCandidates.length > 0) {
    const { data } = await supabase
      .from("users")
      .select("id,email")
      .eq("client_id", clientId)
      .in("email", emailCandidates);

    existingUser = data?.[0] || null;
  }

  if (existingUser) {
    const { error } = await supabase
      .from("users")
      .update({
        email: targetEmail,
        password: hashedPassword,
        role,
      })
      .eq("id", existingUser.id);

    if (error) {
      throw new Error(error.message || "No se pudo actualizar el usuario");
    }
  } else {
    const { error } = await supabase.from("users").insert({
      email: targetEmail,
      password: hashedPassword,
      role,
      client_id: clientId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(error.message || "No se pudo crear el usuario");
    }
  }

  let existingPortalUser = null;
  if (emailCandidates.length > 0) {
    const { data } = await supabase
      .from("portal_users")
      .select("id,email")
      .eq("client_id", clientId)
      .in("email", emailCandidates);

    existingPortalUser = data?.[0] || null;
  }

  if (existingPortalUser) {
    const { error } = await supabase
      .from("portal_users")
      .update({
        email: targetEmail,
        role,
        full_name: fullName || targetEmail,
        phone: phone || "",
        is_active: true,
      })
      .eq("id", existingPortalUser.id);

    if (error) {
      throw new Error(error.message || "No se pudo actualizar el portal user");
    }
  } else {
    const { error } = await supabase.from("portal_users").insert({
      client_id: clientId,
      email: targetEmail,
      full_name: fullName || targetEmail,
      role,
      phone: phone || "",
      is_active: true,
    });

    if (error) {
      throw new Error(error.message || "No se pudo crear el portal user");
    }
  }

  const clientUpdate = {
    owner_email: targetEmail,
  };

  if (stripeCustomerId) {
    clientUpdate.stripe_customer_id = stripeCustomerId;
  }

  await supabase.from("clients").update(clientUpdate).eq("id", clientId);

  return {
    email: targetEmail,
    clientId,
    role,
    clientName: clientName || clientId,
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = String(searchParams.get("session_id") || "").trim();
    const ctx = await getPortalContext();

    if (ctx.ok) {
      return Response.json({
        success: true,
        email: ctx.userEmail || ctx.currentUser?.email || "",
        fullName: ctx.currentUser?.full_name || "",
        clientId: ctx.clientId,
        publicCheckout: false,
      });
    }

    const session = await getPaidCheckoutSession(sessionId);

    return Response.json({
      success: true,
      email: normalizeEmail(session.customer_details?.email || ""),
      fullName: String(session.customer_details?.name || "").trim(),
      phone: String(session.customer_details?.phone || "").trim(),
      productName: session.metadata?.product_name || "",
      productTier: session.metadata?.product_tier || "",
      publicCheckout: true,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message:
          error.message || "No se pudo cargar el contexto de configuracion",
      },
      { status: 400 }
    );
  }
}

export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para configurar la cuenta"
    );
    if (sameOriginError) return sameOriginError;

    const rateLimitError = await requireRateLimitAsync(req, {
      namespace: "portal-account-setup",
      limit: 10,
      windowMs: 30 * 60 * 1000,
      message:
        "Se han detectado demasiados intentos de configuración. Espera un momento antes de volver a intentarlo.",
    });
    if (rateLimitError) return rateLimitError;

    const ctx = await getPortalContext();
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");
    const sessionId = String(body?.sessionId || "").trim();

    if (!email || !password) {
      return Response.json(
        { success: false, message: "Faltan email o contrasena" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        {
          success: false,
          message: "La contrasena debe tener al menos 6 caracteres",
        },
        { status: 400 }
      );
    }

    if (ctx.ok) {
      const role = resolvePortalRole(ctx.role);

      const access = await upsertPortalAccess({
        supabase: ctx.supabase,
        clientId: ctx.clientId,
        clientName: ctx.clientId,
        currentEmail: ctx.userEmail || ctx.currentUser?.email || email,
        email,
        password,
        role,
        fullName: ctx.currentUser?.full_name || email,
        phone: ctx.currentUser?.phone || "",
      });

      if (requiresTwoFactor(access.role)) {
        const code = generateTwoFactorCode();
        await setTwoFactorChallenge({
          email: access.email,
          clientId: access.clientId,
          role: access.role,
          clientName: access.clientName,
          nextPath: "/portal",
          code,
        });
        await sendTwoFactorCode({
          email: access.email,
          code,
          clientName: access.clientName,
          role: access.role,
        });

        return Response.json({
          success: true,
          requiresTwoFactor: true,
          message: "Cuenta actualizada. Te hemos enviado un código para completar el acceso.",
          redirectTo: "/login",
        });
      }

      await setAuthCookies(access);

      return Response.json({
        success: true,
        message: "Cuenta actualizada correctamente",
        redirectTo: "/portal",
      });
    }

    const session = await getPaidCheckoutSession(sessionId);
    const supabase = getSupabase();
    const client = await ensureClientForCheckout({
      supabase,
      session,
      email,
    });

    const access = await upsertPortalAccess({
      supabase,
      clientId: client.id,
      clientName: client.name,
      currentEmail: session.customer_details?.email || email,
      email,
      password,
      role: "owner",
      fullName: String(session.customer_details?.name || "").trim() || email,
      phone: String(session.customer_details?.phone || "").trim(),
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : "",
    });

    if (requiresTwoFactor(access.role)) {
      const code = generateTwoFactorCode();
      await setTwoFactorChallenge({
        email: access.email,
        clientId: access.clientId,
        role: access.role,
        clientName: access.clientName,
        nextPath: "/portal",
        code,
      });
      await sendTwoFactorCode({
        email: access.email,
        code,
        clientName: access.clientName,
        role: access.role,
      });

      return Response.json({
        success: true,
        requiresTwoFactor: true,
        message:
          "Cuenta creada correctamente. Te hemos enviado un código para confirmar el acceso del owner.",
        redirectTo: "/login",
      });
    }

    await setAuthCookies(access);

    return Response.json({
      success: true,
      message: "Cuenta creada correctamente",
      redirectTo: "/portal",
    });
  } catch (error) {
    console.error("POST /api/portal/account/setup error:", error);
    return Response.json(
      {
        success: false,
        message: error.message || "Error configurando la cuenta",
      },
      { status: 500 }
    );
  }
}
