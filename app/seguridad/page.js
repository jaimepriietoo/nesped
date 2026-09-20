import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Footer, Header } from "@/components/v3/chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata = {
  title: "Seguridad",
  description: "Cómo protege Nesped los datos de cada empresa y cómo avisarnos de un fallo.",
};

/**
 * La página que enlaza security.txt. Dice lo que hacemos, sin detalles que
 * sirvan de mapa a nadie, y cómo avisarnos si alguien encuentra un fallo.
 */
export default function Seguridad() {
  const medidas = [
    {
      meta: "Aislamiento por empresa",
      texto:
        "Cada empresa sólo ve sus datos. El filtro lo aplica la propia base de datos en cada consulta, no sólo la aplicación: aunque el código se equivocara, otra empresa no vería nada.",
    },
    {
      meta: "Acceso",
      texto:
        "Contraseñas con scrypt, segundo factor por correo, SMS o aplicación autenticadora, sesiones firmadas que se revocan al instante y auditoría de cada acceso.",
    },
    {
      meta: "Comunicaciones",
      texto:
        "Todo va por HTTPS con HSTS. Los avisos que recibimos de Stripe, Twilio y ElevenLabs se comprueban por firma y ventana temporal y no se procesan dos veces.",
    },
    {
      meta: "Secretos",
      texto:
        "Las claves viven fuera del código, se escanea cada cambio y el historial en busca de secretos, y los factores de autenticación se guardan cifrados.",
    },
    {
      meta: "Dependencias",
      texto:
        "Las dependencias se instalan sin ejecutar código de terceros, se revisan cada semana y ninguna vulnerabilidad alta pasa la integración continua.",
    },
    {
      meta: "Retención",
      texto:
        "Grabaciones y transcripciones se borran en plazos definidos y públicos. La auditoría se conserva más tiempo que el historial de contacto.",
    },
  ];

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo="" cta="Volver a inicio" ctaHref="/" />

      <section className="v3-section" style={{ paddingTop: "clamp(40px, 7vh, 72px)" }}>
        <div className="v3-wrap">
          <span className="v3-eyebrow">Seguridad</span>
          <h1 className="v3-h2">Cómo protegemos los datos</h1>
          <p className="v3-lede">
            Nesped gestiona llamadas y contactos de otras empresas. Esto es lo
            que hacemos para que esos datos sólo los vea quien debe.
          </p>

          <div className="v3-grid" data-c="3">
            {medidas.map((m) => (
              <article key={m.meta} className="v3-card">
                <span className="v3-card-meta">{m.meta}</span>
                <p className="v3-p">{m.texto}</p>
              </article>
            ))}
          </div>

          <div className="v3-card" style={{ marginTop: "clamp(32px, 5vh, 48px)" }}>
            <span className="v3-card-meta">¿Has encontrado un fallo?</span>
            <p className="v3-p">
              Escríbenos a{" "}
              <a href="mailto:seguridad@nesped.com">seguridad@nesped.com</a>{" "}
              antes de publicarlo. Te contestamos, lo corregimos y te
              reconocemos el aviso si quieres. Pedimos que no se acceda a datos
              de terceros ni se degrade el servicio durante la prueba. Los
              detalles están en{" "}
              <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
