"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        boundary: "app.error",
      },
    });
  }, [error]);

  return (
    <div className="app-shell">
      <div className="page-shell" style={{ minHeight: "100vh", justifyContent: "center" }}>
        <main className="content-frame">
          <section className="glass-panel stack-18" style={{ textAlign: "center" }}>
            <div className="subtle-label">Unexpected issue</div>
            <h1 className="section-title">Algo se torció en esta vista</h1>
            <p className="support-copy">
              Hemos registrado el error para revisarlo. Puedes reintentar o volver
              al inicio sin perder la sesión.
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
              <Link className="ghost-button" href="/">
                Ir a inicio
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
