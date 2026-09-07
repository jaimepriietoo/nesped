"use client";

import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { EstadoPagina } from "@/components/v3/estado-pagina";

export default function Error({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "app.error" } });
  }, [error]);

  return (
    <EstadoPagina
      codigo="ERROR"
      titulo="Algo se torció en esta vista"
      texto="Ya lo hemos registrado para revisarlo. Puedes reintentar o volver al inicio sin perder la sesión."
    >
      <button type="button" className="v3-btn v3-btn--white" onClick={() => reset()}>
        Reintentar
      </button>
      <Link className="v3-btn" href="/">Ir a inicio</Link>
    </EstadoPagina>
  );
}
