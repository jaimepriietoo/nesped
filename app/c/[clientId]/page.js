"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Logo } from "@/components/v3/chrome";
import { Rev } from "@/components/v3/rev";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/**
 * Página pública de un cliente (marca blanca).
 *
 * Pide sólo su ficha con ?id=. Antes se descargaba /api/clients entera y
 * filtraba en el navegador, con lo que cualquier visitante se llevaba la
 * cartera de clientes completa.
 */
export default function ClientLanding({ params }) {
  // En Next 15+ los params llegan como promesa.
  const { clientId } = use(params);

  const [cliente, setCliente] = useState(undefined); // undefined = cargando
  const [telefono, setTelefono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients?id=${encodeURIComponent(clientId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (vivo) setCliente(json?.data?.[0] || null);
      })
      .catch(() => {
        if (vivo) setCliente(null);
      });
    return () => { vivo = false; };
  }, [clientId]);

  async function lanzarLlamada() {
    if (!telefono.trim()) {
      setEstado({ ok: false, text: "Introduce un teléfono para lanzar la demo." });
      return;
    }
    setCargando(true);
    setEstado(null);
    try {
      const res = await fetch("/api/demo-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, client_id: clientId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setEstado({ ok: false, text: json.message || "No se pudo lanzar la llamada." });
        return;
      }
      setEstado({ ok: true, text: "Llamada lanzada. Revisa tu móvil." });
    } catch {
      setEstado({ ok: false, text: "Error técnico al lanzar la llamada." });
    } finally {
      setCargando(false);
    }
  }

  if (cliente === undefined) {
    return (
      <div className={`v3 ${inter.className}`} style={{ minHeight: "100dvh" }}>
        <div className="v3-wrap" style={{ paddingTop: "22vh" }}>
          <span className="v3-eyebrow">Cargando</span>
        </div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className={`v3 ${inter.className}`} style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <span className="v3-eyebrow">Página de marca</span>
          <h1 className="v3-h2" style={{ marginTop: 10 }}>Este cliente no existe</h1>
          <p className="v3-lede" style={{ margin: "16px auto 26px" }}>
            La dirección no corresponde a ninguna cuenta activa.
          </p>
          <Link className="v3-btn v3-btn--white" href="/">Ir a Nesped</Link>
        </div>
      </div>
    );
  }

  const marca = cliente.brandName || cliente.name;

  return (
    <div className={`v3 ${inter.className}`}>
      <header className="v3-header">
        <div className="v3-header-inner">
          <span className="v3-logo" aria-hidden="true">
            {cliente.brandLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cliente.brandLogoUrl} alt="" width={52} height={52} />
            ) : (
              <Logo />
            )}
          </span>
          <nav className="v3-nav" aria-label="Principal">
            <span className="v3-navlink" aria-current="page">{marca}</span>
          </nav>
          <a className="v3-btn v3-btn--dark" href="/portal">Acceso clientes</a>
        </div>
      </header>

      <section className="v3-section" style={{ paddingTop: "clamp(90px, 15vh, 170px)" }}>
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">{cliente.type || "Atención telefónica"}</span>
            <h1 className="v3-h1-page">
              {cliente.tagline || "Contestamos siempre, a cualquier hora"}
            </h1>
            <p className="v3-lede">
              {marca} atiende cada llamada con una voz que entiende lo que
              necesitas, lo apunta y te devuelve la respuesta sin esperas.
            </p>
          </Rev>

          <div className="v3-grid" data-c="2" style={{ marginTop: 40 }}>
            <Rev className="v3-card">
              <span className="v3-card-meta">Qué vas a oír</span>
              <h3 className="v3-h3">Una llamada real, no una locución</h3>
              <p className="v3-p">
                Tono natural, preguntas con sentido y tu petición registrada al
                colgar. Exactamente lo que oiría un cliente.
              </p>
            </Rev>

            <Rev className="v3-card" d={0.09}>
              <div className="v3-field">
                <label className="v3-label" htmlFor="c-tel">Teléfono para la demo</label>
                <input
                  id="c-tel"
                  className="v3-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+346XXXXXXXX"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="v3-btn v3-btn--white"
                style={{ marginTop: 16, width: "100%" }}
                onClick={lanzarLlamada}
                disabled={cargando}
              >
                {cargando ? "Lanzando llamada…" : "Recibir la llamada"}
              </button>

              <p className="v3-status" data-ok={estado ? String(estado.ok) : undefined} role="status" aria-live="polite">
                {estado?.text || ""}
              </p>

              <p className="v3-legal">
                La llamada puede grabarse y transcribirse con fines de calidad y
                seguimiento. <a href="/legal/voice-compliance">Ver política</a>
              </p>
            </Rev>
          </div>
        </div>
      </section>

      <footer className="v3-footer">
        <div className="v3-wrap v3-footer-inner">
          <span>© {new Date().getFullYear()} {marca}</span>
          <span>Con tecnología de <Link href="/">Nesped</Link></span>
        </div>
      </footer>
    </div>
  );
}
