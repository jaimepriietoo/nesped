"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inter } from "next/font/google";
import "../v3.css";
import { Logo } from "../chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";

/**
 * Acceso con el mismo flujo real que /login: credenciales → 2FA por correo.
 * Solo cambia la piel; los tres endpoints y sus contratos son idénticos.
 */
function Acceso() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [debugCode, setDebugCode] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      setMessage("");
      setDebugCode("");

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          next: searchParams?.get("next") || "",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setError(json.message || "Login incorrecto");
        return;
      }

      if (json.requiresTwoFactor) {
        setStep("verify");
        setMessage(`Te hemos enviado un código de verificación a ${email}.`);
        setDebugCode(json.debugCode || "");
        return;
      }

      window.location.replace(json.redirectTo || "/portal");
    } catch {
      setError("Error iniciando sesión");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const res = await fetch("/api/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setError(json.message || "Código incorrecto");
        return;
      }

      window.location.replace(json.redirectTo || "/portal");
    } catch {
      setError("Error verificando el código");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    try {
      setResending(true);
      setError("");
      setMessage("");

      const res = await fetch("/api/login/2fa/resend", { method: "POST" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setError(json.message || "No se pudo reenviar el código");
        return;
      }

      setMessage(`Te hemos enviado un nuevo código a ${email}.`);
      setDebugCode(json.debugCode || "");
    } catch {
      setError("Error reenviando el código");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="v3-auth">
      <div className="v3-bg" aria-hidden="true">
        <video autoPlay muted loop playsInline preload="none" poster="/fonts/poster.svg">
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>
      </div>

      <div className="v3-auth-card">
        <a className="v3-logo" href="/v3" aria-label="Inicio" style={{ marginInline: "auto" }}>
          <Logo />
        </a>

        <h1 className="v3-auth-title">
          {step === "credentials" ? "Área de clientes" : "Verificación"}
        </h1>
        <p className="v3-auth-sub">
          {step === "credentials"
            ? "Accede a tus llamadas, tus contactos y tu facturación."
            : "Introduce el código que te hemos enviado por correo."}
        </p>

        {step === "credentials" ? (
          <form className="v3-auth-form" onSubmit={handleLogin}>
            <div className="v3-field">
              <label className="v3-label" htmlFor="v3-email">Correo</label>
              <input
                id="v3-email"
                className="v3-input"
                type="email"
                autoComplete="username"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="v3-field">
              <label className="v3-label" htmlFor="v3-pass">Contraseña</label>
              <input
                id="v3-pass"
                className="v3-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button className="v3-btn v3-btn--white" type="submit" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : (
          <form className="v3-auth-form" onSubmit={handleVerify}>
            <div className="v3-field">
              <label className="v3-label" htmlFor="v3-code">Código de verificación</label>
              <input
                id="v3-code"
                className="v3-input v3-input--code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <button className="v3-btn v3-btn--white" type="submit" disabled={loading}>
              {loading ? "Verificando…" : "Verificar"}
            </button>

            <button
              className="v3-btn v3-btn--ghost"
              type="button"
              onClick={resendCode}
              disabled={resending}
            >
              {resending ? "Reenviando…" : "Reenviar código"}
            </button>
          </form>
        )}

        <p className="v3-status" data-ok={error ? "false" : message ? "true" : undefined} role="status" aria-live="polite">
          {error || message}
        </p>

        {/* Solo aparece si el backend lo devuelve (entornos sin correo). */}
        {debugCode ? (
          <p className="v3-legal">Código de desarrollo: <strong>{debugCode}</strong></p>
        ) : null}

        <p className="v3-legal">
          ¿Problemas para entrar?{" "}
          <a href="mailto:soporte@nesped.com">Escríbenos a soporte</a>
        </p>
      </div>
    </div>
  );
}

export default function V3Login() {
  return (
    <div className={`v3 ${inter.className}`}>
      <Suspense fallback={null}>
        <Acceso />
      </Suspense>
    </div>
  );
}
