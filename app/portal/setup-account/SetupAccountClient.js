"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBackdrop, SiteHeader } from "@/components/site-chrome";

async function readJsonResponse(res) {
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "La solicitud no se pudo completar.");
  }

  return json;
}

export default function SetupAccountClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") || "";

  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [context, setContext] = useState({
    productName: "",
    publicCheckout: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      try {
        const url = sessionId
          ? `/api/portal/account/setup?session_id=${encodeURIComponent(sessionId)}`
          : "/api/portal/account/setup";
        const res = await fetch(url, { cache: "no-store" });
        const json = await readJsonResponse(res);

        if (cancelled) return;

        setForm((prev) => ({
          ...prev,
          email: json?.email || "",
        }));
        setContext({
          productName: json?.productName || "",
          publicCheckout: Boolean(json?.publicCheckout),
        });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "No se pudo cargar la configuracion.");
        }
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.email || !form.password) {
      setError("Completa email y contrasena.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const res = await fetch("/api/portal/account/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          sessionId,
        }),
      });

      const json = await readJsonResponse(res);
      setMessage(json.message || "Cuenta guardada correctamente.");

      setTimeout(() => {
        const target = json.requiresTwoFactor
          ? `${json.redirectTo || "/login"}?next=${encodeURIComponent("/portal")}`
          : json.redirectTo || "/portal";
        router.push(target);
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err?.message || "No se pudo guardar la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <AppBackdrop />
      <div className="page-shell">
        <SiteHeader
          secondaryCta={{ href: "/", label: "Inicio" }}
          primaryCta={{ href: "/portal", label: "Portal" }}
        />

        <main className="content-frame" style={{ paddingTop: "4.5rem", paddingBottom: "4rem" }}>
          <div className="hero-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(390px,0.95fr)" }}>
            <section className="stack-24">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                Pago completado
              </div>

              <div className="stack-18">
                <h1 className="display-title" style={{ fontSize: "clamp(2.8rem,6vw,5.3rem)" }}>
                  Activa el acceso del cliente
                  <span className="accent">y entra con una cuenta real.</span>
                </h1>
                <p className="lede">
                  Tras el checkout, dejamos listo el acceso del cliente con un flujo
                  limpio: definir email, guardar contrasena y entrar al portal sin
                  pasos improvisados.
                </p>
              </div>

              <div className="section-grid md:grid-cols-2">
                <div className="metric-card">
                  <div className="metric-label">Estado</div>
                  <div className="metric-value">Cuenta lista</div>
                  <div className="metric-detail">Solo falta fijar las credenciales de acceso.</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Plan activado</div>
                  <div className="metric-value">{context.productName || "Portal"}</div>
                  <div className="metric-detail">El acceso se asociara al cliente que acaba de pagar.</div>
                </div>
              </div>
            </section>

            <section className="form-shell" style={{ borderRadius: "32px", padding: "1.6rem" }}>
              <div className="stack-24">
                <div className="stack-12">
                  <div className="subtle-label">Configuracion final</div>
                  <h2 className="section-title" style={{ fontSize: "2.2rem" }}>
                    Define el acceso
                  </h2>
                  <p className="support-copy">
                    Este email y esta contrasena seran las credenciales con las que
                    el cliente entrara al portal.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="stack-18">
                  <div className="stack-12">
                    <label className="subtle-label">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="cliente@empresa.com"
                      className="premium-input"
                    />
                  </div>

                  <div className="stack-12">
                    <label className="subtle-label">Contrasena</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="Nueva contrasena"
                      className="premium-input"
                    />
                  </div>

                  <div className="stack-12">
                    <label className="subtle-label">Repetir contrasena</label>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                      }
                      placeholder="Repite la contrasena"
                      className="premium-input"
                    />
                  </div>

                  {error ? <div className="status-pill error">{error}</div> : null}
                  {message ? <div className="status-pill success">{message}</div> : null}

                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={loading} className="button-primary">
                      {loading ? "Guardando..." : "Guardar acceso"}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/portal")}
                      disabled={context.publicCheckout && !message}
                      className="button-secondary"
                    >
                      Volver al portal
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
