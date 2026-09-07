import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";
import { Footer, Header } from "@/components/v3/chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata = {
  title: "Política de grabaciones",
};

/**
 * Componente de servidor: la política se lee en el servidor con
 * getVoiceCompliancePolicy(), igual que la página original, para que los
 * plazos de retención salgan siempre de la configuración real y no de
 * valores escritos a mano.
 */
export default function V3Legal() {
  const policy = getVoiceCompliancePolicy();

  const bloques = [
    {
      meta: "Finalidad",
      texto:
        "Las llamadas pueden grabarse y transcribirse para control de calidad, seguridad, seguimiento comercial, entrenamiento del servicio y trazabilidad operativa. La finalidad debe ser proporcionada, legítima y coherente con la relación comercial o de soporte.",
    },
    {
      meta: "Retención",
      texto: `Las grabaciones se conservan hasta ${policy.recordingRetentionDays} días y las transcripciones hasta ${policy.transcriptRetentionDays} días, salvo que se requiera un plazo menor o mayor por obligación legal o contractual.`,
    },
    {
      meta: "Derechos y alternativa",
      texto: `Si una persona no desea continuar con una llamada grabada o transcrita, debe disponer de una alternativa razonable de contacto y del derecho a retirarse de la conversación. ${policy.rightsSummary}`,
    },
  ];

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo="" cta="Volver a inicio" ctaHref="/" />

      <section className="v3-section" style={{ paddingTop: "clamp(40px, 7vh, 72px)" }}>
        <div className="v3-wrap">
          <span className="v3-eyebrow">Voice compliance</span>
          <h1 className="v3-h2">Política de grabaciones y transcripciones</h1>
          <p className="v3-lede">
            Marco operativo para llamadas asistidas por IA: grabación,
            transcripción, retención y tratamiento de información comercial.
          </p>

          <div className="v3-card" style={{ marginTop: "clamp(32px, 5vh, 48px)" }}>
            <span className="v3-card-meta">Aviso activo</span>
            <p className="v3-quote">{policy.noticeText}</p>
            <p className="v3-p" style={{ marginTop: 14 }}>
              Este aviso se reproduce antes de conectar la llamada con la
              experiencia de voz en tiempo real.
            </p>
          </div>

          <div className="v3-grid" data-c="3">
            {bloques.map((b) => (
              <article key={b.meta} className="v3-card">
                <span className="v3-card-meta">{b.meta}</span>
                <p className="v3-p">{b.texto}</p>
              </article>
            ))}
          </div>

          <div className="v3-grid" data-c="2">
            <article className="v3-card">
              <span className="v3-card-meta">Responsabilidades</span>
              <p className="v3-p">
                Cada instancia debe informar del tratamiento, mantener el aviso
                activo y respetar los plazos de retención configurados. La
                configuración es responsabilidad del titular de la instancia.
              </p>
            </article>
            <article className="v3-card">
              <span className="v3-card-meta">Proveedores y seguridad</span>
              <p className="v3-p">
                Las comunicaciones van firmadas criptográficamente, el acceso al
                portal exige doble factor y toda acción queda registrada en un
                log de auditoría exportable.
              </p>
            </article>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
