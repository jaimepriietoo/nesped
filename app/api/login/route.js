import { getSupabase } from "@/lib/supabase";
import {
  generateTwoFactorCode,
  requiresTwoFactor,
  sanitizeNextPath,
  setAuthCookies,
  setTwoFactorChallenge,
  verifyPasswordWithoutAccountLeak,
} from "@/lib/server/auth";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { avisarDeAcceso } from "@/lib/server/aviso-acceso.mjs";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { sendTwoFactorCode } from "@/lib/server/two-factor.mjs";
import { Login, validar } from "@/lib/server/esquemas";
import { estadoTotp } from "@/lib/server/totp";
import { anotarPais, paisNuevo } from "@/lib/server/anomalias";
import { tienePasskeys } from "@/lib/server/passkeys";

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

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const supabase = getSupabase();
    const leido = validar(Login, cuerpo.datos, { mensaje: "Faltan el correo o la contraseña" });
    if (leido.respuesta) return leido.respuesta;
    const { email, password, next: nextPath } = leido.datos;

    const emailRateLimitError = await requireRateLimitAsync(req, {
      namespace: "login:email",
      limit: 8,
      windowMs: 15 * 60 * 1000,
      keyParts: [email],
      includeIp: false,
      message: "Demasiados intentos para este usuario. Espera unos minutos e inténtalo de nuevo.",
    });
    if (emailRateLimitError) return emailRateLimitError;

    const { data: user, error } = await supabase
      .from("users")
      .select("email,password,password_hash,role,client_id,session_epoch")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    let authenticatedUser = null;

    const storedPassword = user?.password || user?.password_hash || "";

    const passwordMatches = verifyPasswordWithoutAccountLeak(password, storedPassword);

    if (!error && user && passwordMatches) {
      authenticatedUser = {
        email,
        client_id: user.client_id,
        role: user.role || "client",
        // La generación de sesión vigente, para firmarla dentro del token.
        sessionEpoch: Number(user.session_epoch || 0),
      };
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

    const { data: profile, error: profileError } = await supabase.from("portal_users")
      .select("role,is_active,phone").eq("client_id", authenticatedUser.client_id)
      .eq("email", email).maybeSingle();
    if (profileError || !profile || profile.is_active !== true) {
      return Response.json({ success: false, message: "Credenciales incorrectas" }, { status: 401 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id,name,is_active")
      .eq("id", authenticatedUser.client_id)
      .single();

    if (!client || client.is_active === false) {
      return Response.json({ success: false, message: "Credenciales incorrectas" }, { status: 401 });
    }

    const normalizedRole = authenticatedUser.role || "client";
    const clientName =
      client?.name || authenticatedUser.clientName || authenticatedUser.client_id;
    // Mismo saneador que usa el reto de doble factor: una copia aparte se
    // queda atrás en cuanto se endurece una de las dos, que es lo que había
    // pasado aquí.
    const redirectTo = sanitizeNextPath(nextPath);

    const totp = await estadoTotp({ email, clientId: authenticatedUser.client_id });
    const passkey = await tienePasskeys({ email, clientId: authenticatedUser.client_id });
    /* Un país desde el que esta cuenta nunca había entrado exige el segundo
       factor aunque el rol no lo pida. El país lo pone Vercel; fuera de
       Vercel no hay cabecera y no se exige nada. */
    const pais = String(req.headers.get("x-vercel-ip-country") || "").toUpperCase();
    const origen = await paisNuevo({ email, clientId: authenticatedUser.client_id, pais });
    if (origen.nuevo) {
      logEvent("warn", "auth.pais_nuevo", { client_id: authenticatedUser.client_id, pais, conocidos: origen.conocidos });
    }
    if (passkey || totp.enabled || origen.nuevo || requiresTwoFactor(normalizedRole) || requiresTwoFactor(profile.role)) {
      const code = generateTwoFactorCode();
      await setTwoFactorChallenge({
        email,
        clientId: authenticatedUser.client_id,
        role: normalizedRole,
        clientName,
        nextPath: redirectTo,
        code,
        sessionEpoch: authenticatedUser.sessionEpoch || 0,
        /* Passkey antes que TOTP, TOTP antes que correo: del factor que no
           se puede phishear al que sí. */
        factorType: passkey ? "passkey" : totp.enabled ? "totp" : "email",
        totpEnabled: totp.enabled,
        pais,
      });

      if (passkey || totp.enabled) {
        return Response.json({
          success: true,
          requiresTwoFactor: true,
          challengeExpiresIn: 10 * 60,
          verificationMethod: passkey ? "passkey" : "totp",
          /* Con passkey, la casilla de código sigue valiendo para TOTP (si
             lo hay) o para un código de recuperación. */
          totpFallback: passkey && totp.enabled,
        });
      }

      // El móvil sólo se usa si el correo falla, para no dejar a nadie fuera
      // por una caída del proveedor de email.
      const { data: perfil } = await supabase
        .from("portal_users")
        .select("phone")
        .eq("client_id", authenticatedUser.client_id)
        .eq("email", email)
        .maybeSingle();

      const delivery = await sendTwoFactorCode({
        email,
        code,
        clientName,
        role: normalizedRole,
        telefono: perfil?.phone || "",
      });

      return Response.json({
        success: true,
        requiresTwoFactor: true,
        challengeExpiresIn: 10 * 60,
        verificationChannel: delivery.channel || "email",
        verificationMethod: "delivery",
        debugCode: delivery.debugCode || "",
      });
    }

    await setAuthCookies({
      email,
      clientId: authenticatedUser.client_id,
      role: normalizedRole,
      clientName,
      sessionEpoch: authenticatedUser.sessionEpoch || 0,
    });
    void anotarPais({ email, clientId: authenticatedUser.client_id, pais });

    /*
     * Aviso de acceso, sin esperar a que salga.
     *
     * Se lanza a propósito sin await: quien acaba de meter bien su contraseña
     * no tiene por qué esperar a que un proveedor de correo responda, y si el
     * correo falla el acceso debe seguir funcionando igual. Es exactamente el
     * error que ya tumbó el segundo factor una vez.
     */
    void avisarDeAcceso({
      email,
      rol: normalizedRole,
      clientName,
      pais,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
      agente: req.headers.get("user-agent") || "",
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
        message: "Error iniciando sesión",
      },
    });

    return Response.json(
      { success: false, message: "Error iniciando sesión" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.login.post", handlePost);
