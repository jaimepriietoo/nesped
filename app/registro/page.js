import { Suspense } from "react";
import Registro from "./registro-cliente";

export const metadata = {
  title: "Crear cuenta · Nesped",
  description:
    "Crea tu cuenta de Nesped y activa tu agente de voz. Sin permanencia.",
};

export default function PaginaRegistro() {
  return (
    <Suspense fallback={null}>
      <Registro />
    </Suspense>
  );
}
