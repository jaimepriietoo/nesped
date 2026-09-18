import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";
import { EMPRESA, ENCARGADOS } from "@/lib/legal";
import { Footer, Header } from "@/components/v3/chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata = {
  title: "Información para quien llama",
  description: "Qué pasa con tu llamada cuando la atiende la asistente virtual de una empresa que usa Nesped: quién la graba, para qué, cuánto tiempo, y cómo pedir que se borre.",
};

/**
 * La página corta para quien llama.
 *
 * La asistente avisa al descolgar de que es una IA y de que la llamada se
 * graba; esto es el "más información" de ese aviso, con la dirección corta
 * (nesped.com/llamadas) que se puede decir por teléfono. Está escrita para
 * la persona que acaba de llamar a su fontanero o a su operador de fibra, no
 * para un abogado: qué pasa, quién lo hace, cuánto dura y cómo se borra.
 */
export default function Llamadas() {
  const p = getVoiceCompliancePolicy();
  const voz = ENCARGADOS.filter((e) => /Twilio|ElevenLabs|Gemini|Supabase/.test(e.nombre));

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo="" cta="Volver a inicio" ctaHref="/" />
      <section className="v3-section" style={{ paddingTop: "clamp(40px, 7vh, 72px)" }}>
        <div className="v3-wrap" style={{ maxWidth: 760 }}>
          <span className="v3-eyebrow">Tu llamada</span>
          <h1 className="v3-h2">Has hablado con una asistente virtual</h1>
          <p className="v3-lede">
            La empresa a la que has llamado atiende su teléfono con Nesped: una
            asistente de voz con inteligencia artificial que te escucha, te
            responde y deja nota de lo que necesitas para que te llamen. Esto
            es lo que pasa con tu llamada, en corto.
          </p>

          <div className="v3-grid" data-c="2" style={{ marginTop: "clamp(28px, 4vh, 40px)" }}>
            <article className="v3-card">
              <span className="v3-card-meta">Qué se guarda</span>
              <p className="v3-p">La grabación de la llamada, su transcripción, tu número de teléfono, y lo que hayas dicho que necesitas: tu nombre si lo has dado, tu localidad, el motivo de la llamada.</p>
            </article>
            <article className="v3-card">
              <span className="v3-card-meta">Para qué</span>
              <p className="v3-p">Para que la empresa sepa quién ha llamado y qué quería, pueda devolverte la llamada y atenderte con lo que ya has contado, y para comprobar que la asistente atiende bien.</p>
            </article>
            <article className="v3-card">
              <span className="v3-card-meta">Cuánto tiempo</span>
              <p className="v3-p">La grabación se borra a los <strong>{p.recordingRetentionDays} días</strong> y la transcripción a los <strong>{p.transcriptRetentionDays} días</strong>. Tu nombre, teléfono y motivo se quedan en la agenda de la empresa mientras seas su contacto.</p>
            </article>
            <article className="v3-card">
              <span className="v3-card-meta">Quién trata tus datos</span>
              <p className="v3-p">La empresa a la que llamas es la responsable. Nesped trabaja por cuenta de ella, y para atender la llamada se apoya en: {voz.map((e) => e.nombre).join(", ")}. La lista completa, con dónde está cada uno, está en la <a href="/legal/privacidad">política de privacidad</a>.</p>
            </article>
          </div>

          <div className="v3-card" style={{ marginTop: 16 }}>
            <span className="v3-card-meta">Tus derechos</span>
            <p className="v3-p">
              Puedes pedir una copia de tu grabación o transcripción, que se corrija algo, o que se borre todo lo que
              tenemos de ti. Escribe a <a href={`mailto:${EMPRESA.correoPrivacidad}`}>{EMPRESA.correoPrivacidad}</a> con
              el número desde el que llamaste y el día aproximado. Contestamos en un plazo máximo de un mes, casi siempre
              en pocos días. Si no quieres que una llamada se grabe, díselo a la asistente: te indicará otra forma de
              contactar con la empresa.
            </p>
            <p className="v3-p" style={{ marginTop: 10 }}>
              Si crees que algo no se ha hecho bien, puedes reclamar ante la Agencia Española de Protección de Datos
              (<a href="https://www.aepd.es" rel="noreferrer">aepd.es</a>).
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
