"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        boundary: "app.global-error",
      },
    });
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-full">
        <div className="app-shell">
          <div
            className="page-shell"
            style={{ minHeight: "100vh", justifyContent: "center" }}
          >
            <main className="content-frame">
              <section className="glass-panel stack-18" style={{ textAlign: "center" }}>
                <div className="subtle-label">Global fallback</div>
                <h1 className="section-title">La app ha necesitado reiniciarse</h1>
                <p className="support-copy">
                  Hemos registrado el incidente. Puedes reintentar la carga o volver
                  a entrar al portal.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button className="primary-button" onClick={() => reset()}>
                    Reintentar
                  </button>
                  <Link className="ghost-button" href="/portal">
                    Abrir portal
                  </Link>
                </div>
              </section>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
