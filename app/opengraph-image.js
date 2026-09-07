import { ImageResponse } from "next/og";

/**
 * Tarjeta que se ve al compartir el enlace en WhatsApp, LinkedIn o Slack.
 * Se genera aquí en vez de subir un PNG para que el texto siga al del sitio
 * si cambia, y no se quede una imagen vieja pegada durante meses.
 */
export const runtime = "edge";
export const alt = "Nesped — Cero llamadas sin contestar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          padding: 76,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 54, height: 54, borderRadius: 27, background: "#ffffff",
              display: "flex", alignItems: "flex-end", justifyContent: "center",
              gap: 4, paddingBottom: 14,
            }}
          >
            <div style={{ width: 5, height: 12, borderRadius: 3, background: "#0a0a0a" }} />
            <div style={{ width: 5, height: 20, borderRadius: 3, background: "#0a0a0a" }} />
            <div style={{ width: 5, height: 28, borderRadius: 3, background: "#0a0a0a" }} />
            <div style={{ width: 5, height: 16, borderRadius: 3, background: "#0a0a0a" }} />
          </div>
          <div style={{ fontSize: 26, color: "#8e8e8e", letterSpacing: 4 }}>NESPED</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 82, color: "#ffffff", lineHeight: 1.04, letterSpacing: -3 }}>
            Cero llamadas
          </div>
          <div style={{ fontSize: 82, color: "#ffffff", lineHeight: 1.04, letterSpacing: -3 }}>
            sin contestar
          </div>
          <div style={{ fontSize: 30, color: "#a8a8a8", marginTop: 26, maxWidth: 900, lineHeight: 1.4 }}>
            Contesta al primer tono, cualifica y te deja el siguiente paso escrito.
          </div>
        </div>

        <div style={{ display: "flex", gap: 34, fontSize: 22, color: "#8e8e8e" }}>
          <div style={{ display: "flex" }}>1,2 s en descolgar</div>
          <div style={{ display: "flex" }}>24/7 sin turnos</div>
          <div style={{ display: "flex" }}>nesped.com</div>
        </div>
      </div>
    ),
    size
  );
}
