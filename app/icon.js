import { ImageResponse } from "next/og";

/**
 * Icono de pestaña y de marcador.
 *
 * Se genera desde el mismo trazado que el logo del sitio en vez de mantener
 * un .ico aparte que se queda desactualizado en cuanto cambia la marca.
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const COLUMNAS = [6, 4, 2, 3, 5, 6];
const PASO = 9;
const RADIO = 2.6;

export default function Icon() {
  const ancho = (COLUMNAS.length - 1) * PASO;
  const x0 = 32 - ancho / 2;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          borderRadius: 14,
          position: "relative",
        }}
      >
        {COLUMNAS.map((puntos, col) =>
          Array.from({ length: puntos }, (_, i) => {
            const dy = (i - (puntos - 1) / 2) * (RADIO * 2 + 1.5);
            return (
              <div
                key={`${col}-${i}`}
                style={{
                  position: "absolute",
                  left: x0 + col * PASO - RADIO,
                  top: 32 + dy - RADIO,
                  width: RADIO * 2,
                  height: RADIO * 2,
                  borderRadius: RADIO,
                  background: "#0a0a0a",
                }}
              />
            );
          })
        )}
      </div>
    ),
    size
  );
}
