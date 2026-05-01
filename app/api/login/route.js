import { getSupabase } from "@/lib/supabase";
import {
  generateTwoFactorCode,
  requiresTwoFactor,
  setAuthCookies,
  setTwoFactorChallenge,
  verifyPassword,
} from "@/lib/server/auth";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { sendTwoFactorCode } from "@/lib/server/two-factor.mjs";
import { findUser } from "@/lib/auth";
import { ensureDemoWorkspace, isDemoClientId } from "@/lib/clients";

async function handlePost(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para iniciar sesión"
    );
    if (sameOriginError) return sameOriginError;

    const ipRateLimitError = await requireRateLimitAsync(req, {
      namespace: "login:ip",
      limit: 20,
      windowMs: 15 * 60 * 1000,
      message: "Demasiados intentos de acceso. Espera unos minutos e inténtalo de nuevo.",
    });
    if (ipRateLimitError) return ipRateLimitError;

    const supabase = getSupabase();
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const nextPath = String(body?.next || "").trim();

    if (!email || !password) {
      return Response.json(
        { success: false, message: "Faltan email o contraseña" },
        { status: 400 }
      );
    }

    const emailRateLimitError = await requireRateLimitAsync(req, {
      namespace: "login:email",
      limit: 8,
      windowMs: 15 * 60 * 1000,
      keyParts: [email],
      message: "Demasiados intentos para este usuario. Espera unos minutos e inténtalo de nuevo.",
    });
    if (emailRateLimitError) return emailRateLimitError;

    const { data: user, error } = await supabase
      .from("users")
      .select("email,password,password_hash,role,client_id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    let authenticatedUser = null;

    const storedPassword = user?.password || user?.password_hash || "";

    if (!error && user && verifyPassword(password, storedPassword)) {
      authenticatedUser = {
        email,
        client_id: user.client_id,
        role: user.role || "client",
      };
    } else {
      const legacyUser = findUser(email, password);

      if (legacyUser) {
        if (isDemoClientId(legacyUser.clientId)) {
          await ensureDemoWorkspace(supabase, legacyUser.clientId);
        }
        authenticatedUser = {
          email: legacyUser.email,
          client_id: legacyUser.clientId,
          role: legacyUser.role || "client",
          clientName: legacyUser.clientName || legacyUser.clientId,
        };
      }
    }

    if (!authenticatedUser) {
      logEvent("warn", "auth.login_failed", {
        email,
        reason: "invalid_credentials",
      });
      return Response.json(
        { success: false, message: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", authenticatedUser.client_id)
      .single();

    const normalizedRole = authenticatedUser.role || "client";
    const clientName =
      client?.name || authenticatedUser.clientName || authenticatedUser.client_id;
    const redirectTo =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : "/portal";

    if (requiresTwoFactor(normalizedRole)) {
      const code = generateTwoFactorCode();
      await setTwoFactorChallenge({
        email,
        clientId: authenticatedUser.client_id,
        role: normalizedRole,
        clientName,
        nextPath: redirectTo,
        code,
      });

      const delivery = await sendTwoFactorCode({
        email,
        code,
        clientName,
        role: normalizedRole,
      });

      return Response.json({
        success: true,
        requiresTwoFactor: true,
        challengeExpiresIn: 10 * 60,
        verificationChannel: delivery.channel || "email",
        debugCode: delivery.debugCode || "",
      });
    }

    await setAuthCookies({
      email,
      clientId: authenticatedUser.client_id,
      role: normalizedRole,
      clientName,
    });

    logEvent("info", "auth.login_succeeded", {
      email,
      clientId: authenticatedUser.client_id,
      role: authenticatedUser.role || "client",
    });

    return Response.json({
      success: true,
      clientId: authenticatedUser.client_id,
      clientName,
      role: normalizedRole,
      redirectTo,
    });
  } catch (error) {
    logEvent("error", "auth.login_error", {
      error: {
        name: error?.name || "Error",
        message: error?.message || "Error iniciando sesión",
      },
    });

    return Response.json(
      { success: false, message: "Error iniciando sesión" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.login.post", handlePost);
