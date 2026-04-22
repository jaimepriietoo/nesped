import Link from "next/link";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

export function AppBackdrop() {
  return (
    <div className="app-backdrop" aria-hidden="true">
      <div className="ambient-grid" />
    </div>
  );
}

export function SiteHeader({
  primaryCta = null,
  secondaryCta = null,
  links = [],
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-wordmark">
          <span className="site-wordmark-mark">N</span>
          <span>
            <span className="site-wordmark-title">NESPED</span>
            <span className="site-wordmark-subtitle">Premium Voice Revenue</span>
          </span>
        </Link>

        <nav className="site-nav">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="site-link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {secondaryCta ? (
            <ActionLink href={secondaryCta.href} variant="tertiary">
              {secondaryCta.label}
            </ActionLink>
          ) : null}
          {primaryCta ? (
            <ActionLink href={primaryCta.href} variant="primary">
              {primaryCta.label}
            </ActionLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function ActionLink({ href, children, variant = "primary", className = "" }) {
  const variantClass =
    variant === "secondary"
      ? "button-secondary"
      : variant === "tertiary"
        ? "button-tertiary"
        : "button-primary";

  const isAnchor = href.startsWith("#") || href.startsWith("mailto:");

  if (isAnchor) {
    return (
      <a href={href} className={cx(variantClass, className)}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cx(variantClass, className)}>
      {children}
    </Link>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}) {
  return (
    <div
      className={cx(
        "stack-18",
        align === "center" ? "text-center items-center mx-auto" : ""
      )}
    >
      {eyebrow ? (
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          {eyebrow}
        </div>
      ) : null}
      <h2 className="section-title">{title}</h2>
      {description ? <p className="section-copy">{description}</p> : null}
    </div>
  );
}

export function GlassPanel({ children, className = "" }) {
  return <div className={cx("glass-panel", className)}>{children}</div>;
}

export function SurfaceCard({ children, className = "" }) {
  return <div className={cx("surface-card", className)}>{children}</div>;
}

export function MetricCard({ label, value, detail }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail ? <div className="metric-detail">{detail}</div> : null}
    </div>
  );
}

export function FeatureCard({ title, text, meta = null }) {
  return (
    <SurfaceCard className="stack-12">
      {meta ? <div className="subtle-label">{meta}</div> : null}
      <h3 className="text-2xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="support-copy">{text}</p>
    </SurfaceCard>
  );
}

export function PlanCard({
  name,
  price,
  billing,
  subtitle,
  features,
  href,
  cta,
  highlighted = false,
}) {
  return (
    <SurfaceCard
      className={cx(
        "stack-18 h-full",
        highlighted ? "border-white/18 bg-white/[0.08]" : ""
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="stack-12">
          <div className="subtle-label">{highlighted ? "Recomendado" : "Plan"}</div>
          <div>
            <div className="text-3xl font-semibold tracking-tight text-white">{name}</div>
            <p className="mt-2 text-sm text-white/60">{subtitle}</p>
          </div>
        </div>
        {highlighted ? <span className="status-pill info">Mas vendido</span> : null}
      </div>

      <div>
        <div className="text-5xl font-semibold tracking-[-0.08em] text-white">{price}</div>
        {billing ? <div className="mt-2 text-sm text-white/55">{billing}</div> : null}
      </div>

      <div className="stack-12">
        {features.map((feature) => (
          <div key={feature} className="data-chip">
            <span className="eyebrow-dot" />
            {feature}
          </div>
        ))}
      </div>

      <ActionLink href={href} variant={highlighted ? "primary" : "secondary"}>
        {cta}
      </ActionLink>
    </SurfaceCard>
  );
}
