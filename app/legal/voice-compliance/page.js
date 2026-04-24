import {
  AppBackdrop,
  GlassPanel,
  SectionHeading,
  SiteHeader,
  SurfaceCard,
} from "@/components/site-chrome";
import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";

export default function VoiceCompliancePage() {
  const policy = getVoiceCompliancePolicy();

  return (
    <div className="app-shell">
      <AppBackdrop />
      <div className="page-shell">
        <SiteHeader
          secondaryCta={{ href: "/", label: "Volver a inicio" }}
          primaryCta={{ href: "/portal", label: "Portal" }}
        />

        <main className="content-frame">
          <section className="hero-block stack-24">
            <SectionHeading
              eyebrow="Voice compliance"
              title="Política de grabaciones y transcripciones"
              description="Marco operativo para llamadas asistidas por IA, grabación, transcripción, retención y tratamiento de información comercial."
            />

            <GlassPanel className="stack-18">
              <div className="subtle-label">Aviso activo</div>
              <div className="section-title" style={{ fontSize: "2rem" }}>
                {policy.noticeText}
              </div>
              <p className="support-copy">
                Este aviso se reproduce antes de conectar la llamada con la experiencia
                de voz en tiempo real.
              </p>
            </GlassPanel>
          </section>

          <section className="section-block feature-grid">
            <SurfaceCard className="stack-12">
              <div className="subtle-label">Finalidad</div>
              <p className="support-copy">
                Las llamadas pueden grabarse y transcribirse para control de calidad,
                seguridad, seguimiento comercial, entrenamiento del servicio y trazabilidad
                operativa.
              </p>
            </SurfaceCard>

            <SurfaceCard className="stack-12">
              <div className="subtle-label">Retención</div>
              <p className="support-copy">
                Las grabaciones se conservan hasta {policy.recordingRetentionDays} días y
                las transcripciones hasta {policy.transcriptRetentionDays} días, salvo que
                se requiera un plazo menor o mayor por obligación legal o contractual.
              </p>
            </SurfaceCard>

            <SurfaceCard className="stack-12">
              <div className="subtle-label">Derechos y objeción</div>
              <p className="support-copy">
                Si una persona no desea continuar con una llamada grabada o transcrita,
                debe disponer de una alternativa razonable de contacto y del derecho a
                retirarse de la conversación.
              </p>
            </SurfaceCard>
          </section>

          <section className="section-block">
            <GlassPanel className="stack-18">
              <SectionHeading
                eyebrow="Buenas prácticas"
                title="Qué debe quedar claro al operar llamadas con IA"
                description="Este marco no sustituye asesoramiento legal específico por país o sector. Es la base operativa mínima para desplegar con criterio."
              />
              <div className="support-copy" style={{ lineHeight: 1.8 }}>
                1. El aviso debe darse antes de la conversación útil.<br />
                2. El acceso a audio y transcripciones debe limitarse a personal autorizado.<br />
                3. La retención debe ser proporcionada y revisable.<br />
                4. El portal debe mostrar con claridad cuándo existe grabación disponible.<br />
                5. Los proveedores externos deben mantener sus webhooks y credenciales bajo control.
              </div>
            </GlassPanel>
          </section>
        </main>
      </div>
    </div>
  );
}
