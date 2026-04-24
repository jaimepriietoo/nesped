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
                operativa. La finalidad debe ser proporcionada, legítima y coherente con
                la relación comercial o de soporte.
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
              <div className="subtle-label">Derechos y alternativa</div>
              <p className="support-copy">
                Si una persona no desea continuar con una llamada grabada o transcrita,
                debe disponer de una alternativa razonable de contacto y del derecho a
                retirarse de la conversación. {policy.rightsSummary}
              </p>
            </SurfaceCard>
          </section>

          <section className="section-block feature-grid">
            <SurfaceCard className="stack-12">
              <div className="subtle-label">Responsabilidades</div>
              <p className="support-copy">{policy.responsibleModel}</p>
            </SurfaceCard>

            <SurfaceCard className="stack-12">
              <div className="subtle-label">Proveedores y seguridad</div>
              <p className="support-copy">
                {policy.providerSummary} El acceso a grabaciones y transcripciones debe
                limitarse a personal autorizado y registrarse dentro del entorno
                operativo del cliente y de Nesped.
              </p>
            </SurfaceCard>

            <SurfaceCard className="stack-12">
              <div className="subtle-label">Contacto</div>
              <p className="support-copy">
                Para cuestiones de privacidad, oposición o revisión operativa:
                {" "}
                <a href={`mailto:${policy.contactEmail}`}>{policy.contactEmail}</a>
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
                2. Debe existir una alternativa razonable si la persona no acepta la grabación o transcripción.<br />
                3. El acceso a audio y transcripciones debe limitarse a personal autorizado.<br />
                4. La retención debe ser proporcionada, visible y revisable.<br />
                5. El portal debe mostrar con claridad cuándo existe grabación disponible.<br />
                6. Los proveedores externos deben mantener sus webhooks, credenciales y contratos bajo control.
              </div>
            </GlassPanel>
          </section>

          <section className="section-block">
            <GlassPanel className="stack-18">
              <SectionHeading
                eyebrow="Resumen operativo"
                title="Usos permitidos y límites"
                description="La política final debe alinearse con tu jurisdicción, tu contrato con clientes y el sector en el que operas."
              />
              <div className="support-copy" style={{ lineHeight: 1.85 }}>
                {policy.purposes.map((purpose, index) => (
                  <div key={purpose}>
                    {index + 1}. {purpose}.
                  </div>
                ))}
              </div>
            </GlassPanel>
          </section>
        </main>
      </div>
    </div>
  );
}
