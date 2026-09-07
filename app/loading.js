import { EstadoPagina } from "@/components/v3/estado-pagina";

export default function Loading() {
  return (
    <EstadoPagina titulo="Cargando">
      <div className="estado-pulso" aria-hidden="true" />
    </EstadoPagina>
  );
}
