"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { EstadoPagina } from "@/components/v3/estado-pagina";

/**
 * Última red antes de la página en blanco: si falla el layout raíz, esto es
 * lo único que se pinta. Por eso monta su propio <html> y <body>.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "app.global-error" } });
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <EstadoPagina
          codigo="ERROR GENERAL"
          titulo="La app ha necesitado reiniciarse"
          texto="Ya hemos registrado el incidente. Puedes reintentar la carga o volver a entrar al portal."
        >
          <button type="button" className="v3-btn v3-btn--white" onClick={() => reset()}>
            Reintentar
          </button>
          <a className="v3-btn" href="/portal">Abrir portal</a>
        </EstadoPagina>
      </body>
    </html>
  );
}
