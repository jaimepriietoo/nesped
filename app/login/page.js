"use client";
import Link from "next/link";

import { Suspense, useEffect, useState } from "react";
import { FondoNesped } from "@/components/nucleo/fondo";
import { useSearchParams } from "next/navigation";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Logo } from "@/components/v3/chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

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
  /* La tarjeta se retira antes de navegar. */
  const [saliendo, setSaliendo] = useState(false);
  /* Si hay alguien escribiendo en un campo ahora mismo. */
  const [escribiendo, setEscribiendo] = useState(false);

  /*
   * Qué hace Nesped detrás del formulario.
   *
   * No es una animación de bienvenida: es el mismo objeto de la portada
   * diciendo con los mismos once estados lo que está pasando de verdad en
   * esta pantalla. Quien haya visto la web reconoce que está comprobando algo
   * sin leer una palabra, que es justo lo que la gramática tiene que
   * conseguir.
   *
   * El orden importa: primero lo que ya se ha resuelto —acertar, fallar—,
   * después lo que está en curso, y al final lo que sólo es esperar.
   */
  const estadoNucleo = saliendo ? "ACTING"
    : error ? "ATTENTION"
      : loading || resending ? "THINKING"
        : escribiendo ? "LISTENING"
          : step === "verify" ? "UNDERSTANDING"
            : "IDLE";

  /*
   * Entrar al portal, con la transición entre medias.
   *
   * Son dos páginas distintas y una navegación de verdad, así que no hay
   * forma de encadenar una animación de una a otra. Lo que sí se puede es que
   * las dos mitades se lean como un mismo movimiento: aquí la tarjeta se
   * retira hacia atrás, y al otro lado el portal se construye por orden
   * —columna, cabecera, contenido—. Entre las dos no se ve un salto en blanco.
   *
   * Los 260 ms son el largo de la salida. Si por lo que fuera no llegara a
   * dispararse el temporizador, la sesión ya está abierta: lo peor que pasa
   * es que haya que tocar el enlace del portal.
   */
  function entrar(destino) {
    setSaliendo(true);
    setTimeout(() => window.location.replace(destino), 260);
  }

  /**
   * Hasta que React no ha hidratado, el onSubmit no existe: un clic ahí hace
   * un envío nativo y el navegador recarga /login perdiendo lo escrito. Pasa
   * de verdad en móviles lentos. El botón queda inerte hasta entonces.
   */
  const [listo, setListo] = useState(false);
  useEffect(() => { setListo(true); }, []);

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
        // El código puede haber salido por SMS si el correo falló: decirlo
        // evita que alguien se quede mirando una bandeja de entrada vacía.
        setMessage(
          json.verificationChannel === "sms"
            ? "No hemos podido enviarte el correo, así que te hemos mandado el código por SMS al móvil de la cuenta."
            : `Te hemos enviado un código de verificación a ${email}.`
        );
        setDebugCode(json.debugCode || "");
        return;
      }

      entrar(json.redirectTo || "/portal");
      return;
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

      entrar(json.redirectTo || "/portal");
      return;
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

      setMessage(
        json.verificationChannel === "sms"
          ? "Te hemos mandado un código nuevo por SMS al móvil de la cuenta."
          : `Te hemos enviado un nuevo código a ${email}.`
      );
      setDebugCode(json.debugCode || "");
    } catch {
      setError("Error reenviando el código");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="v3-auth" data-saliendo={saliendo ? "1" : undefined}>
      <FondoNesped estado={estadoNucleo} luz={saliendo ? 1 : 0.92} sitio="izquierda" />

      <div className="v3-auth-card">
        <Link className="v3-logo" href="/" aria-label="Inicio" style={{ marginInline: "auto" }}>
          <Logo />
        </Link>

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
                onFocus={() => setEscribiendo(true)}
                onBlur={() => setEscribiendo(false)}
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
                onFocus={() => setEscribiendo(true)}
                onBlur={() => setEscribiendo(false)}
                required
              />
            </div>

            <button className="v3-btn v3-btn--white" type="submit" disabled={loading || !listo}>
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
                onFocus={() => setEscribiendo(true)}
                onBlur={() => setEscribiendo(false)}
                required
              />
            </div>

            <button className="v3-btn v3-btn--white" type="submit" disabled={loading || !listo}>
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
