"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppBackdrop, SiteHeader } from "@/components/site-chrome";

export default function LoginPage() {
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
        headers: {
          "Content-Type": "application/json",
        },
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
        setMessage(
          `Te hemos enviado un código de verificación a ${email}.`
        );
        setDebugCode(json.debugCode || "");
        return;
      }

      window.location.replace(json.redirectTo || "/portal");
    } catch (err) {
      console.error(err);
      setError("Error iniciando sesion");
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setError(json.message || "Código incorrecto");
        return;
      }

      window.location.replace(json.redirectTo || "/portal");
    } catch (err) {
      console.error(err);
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

      const res = await fetch("/api/login/2fa/resend", {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.message || "No se pudo reenviar el código");
        return;
      }

      setMessage(`Te hemos enviado un nuevo código a ${email}.`);
      setDebugCode(json.debugCode || "");
    } catch (err) {
      console.error(err);
      setError("Error reenviando el código");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="app-shell">
      <AppBackdrop />
      <div className="page-shell">
        <SiteHeader
          secondaryCta={{ href: "/", label: "Volver a inicio" }}
          primaryCta={{ href: "/pricing", label: "Ver planes" }}
        />

        <main className="content-frame" style={{ paddingTop: "4.5rem", paddingBottom: "4rem" }}>
          <div className="hero-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(380px,0.9fr)" }}>
            <section className="stack-24">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                Acceso premium
              </div>

              <div className="stack-18">
                <h1 className="display-title" style={{ fontSize: "clamp(2.8rem,6vw,5.3rem)" }}>
                  Entra al portal con una experiencia limpia,
                  <span className="accent">rapida y seria.</span>
                </h1>
                <p className="lede">
                  Accede a leads, pipeline, metricas, automatizaciones y facturacion
                  desde una sola capa. El objetivo no es solo entrar, sino sentir que
                  estas dentro de un producto premium.
                </p>
              </div>

              <div className="section-grid md:grid-cols-2">
                <div className="metric-card">
                  <div className="metric-label">Visibilidad</div>
                  <div className="metric-value">CRM + voz</div>
                  <div className="metric-detail">Todo el flujo comercial conectado.</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Operativa</div>
                  <div className="metric-value">Tiempo real</div>
                  <div className="metric-detail">Leads, acciones y revenue con contexto.</div>
                </div>
              </div>
            </section>

            <section className="form-shell" style={{ borderRadius: "32px", padding: "1.6rem" }}>
              <div className="stack-24">
                <div className="stack-12">
                  <div className="eyebrow">
                    <span className="eyebrow-dot" />
                    Portal de cliente
                  </div>
                  <div>
                    <h2 className="section-title" style={{ fontSize: "2.35rem" }}>
                      {step === "verify" ? "Verificación segura" : "Acceso privado"}
                    </h2>
                    <p className="support-copy">
                      {step === "verify"
                        ? "Los perfiles owner y admin confirman el acceso con un código temporal."
                        : "Usa el email y la contrasena del cliente para entrar a su panel."}
                    </p>
                  </div>
                </div>

                {step === "verify" ? (
                  <form onSubmit={handleVerify} className="stack-18">
                    <div className="stack-12">
                      <label className="subtle-label">Código de verificación</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="premium-input"
                        placeholder="123456"
                      />
                    </div>

                    {message ? <div className="status-pill success">{message}</div> : null}
                    {error ? <div className="status-pill error">{error}</div> : null}
                    {debugCode ? (
                      <div className="status-pill info">
                        Código debug local: <strong>{debugCode}</strong>
                      </div>
                    ) : null}

                    <button type="submit" disabled={loading} className="button-primary">
                      {loading ? "Verificando..." : "Confirmar acceso"}
                    </button>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={resendCode}
                        disabled={resending}
                        className="button-secondary"
                      >
                        {resending ? "Reenviando..." : "Reenviar código"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("credentials");
                          setCode("");
                          setError("");
                          setMessage("");
                          setDebugCode("");
                        }}
                        className="button-secondary"
                      >
                        Volver
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="stack-18">
                    <div className="stack-12">
                      <label className="subtle-label">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="premium-input"
                        placeholder="cliente@empresa.com"
                      />
                    </div>

                    <div className="stack-12">
                      <label className="subtle-label">Contrasena</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="premium-input"
                        placeholder="Tu acceso"
                      />
                    </div>

                    {message ? <div className="status-pill success">{message}</div> : null}
                    {error ? <div className="status-pill error">{error}</div> : null}

                    <button type="submit" disabled={loading} className="button-primary">
                      {loading ? "Entrando..." : "Entrar al portal"}
                    </button>
                  </form>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
