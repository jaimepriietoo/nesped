"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackdrop, SiteHeader } from "@/components/site-chrome";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setError(json.message || "Login incorrecto");
        return;
      }

      router.push("/portal");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Error iniciando sesion");
    } finally {
      setLoading(false);
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
                      Acceso privado
                    </h2>
                    <p className="support-copy">
                      Usa el email y la contrasena del cliente para entrar a su panel.
                    </p>
                  </div>
                </div>

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

                  {error ? <div className="status-pill error">{error}</div> : null}

                  <button type="submit" disabled={loading} className="button-primary">
                    {loading ? "Entrando..." : "Entrar al portal"}
                  </button>
                </form>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
