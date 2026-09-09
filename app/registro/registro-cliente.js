"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Logo } from "@/components/v3/chrome";
import { LONGITUD_MINIMA_PASSWORD } from "@/lib/server/passwords";
import { PLANES } from "@/lib/planes";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";



/**
 * Alta de cuenta antes del pago.
 *
 * La pantalla no pide tarjeta: eso lo hace Stripe justo después. Pedir las dos
 * cosas a la vez es lo que hace que la gente se caiga a mitad, y además obliga
 * a mantener datos de pago en un formulario nuestro, que es exactamente lo que
 * no queremos tocar.
 */
export default function Registro() {
  const searchParams = useSearchParams();
  const planPedido = String(searchParams?.get("plan") || "growth").toLowerCase();
  const plan = PLANES[planPedido] && !PLANES[planPedido].hablarConVentas ? planPedido : "growth";

  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [yaRegistrado, setYaRegistrado] = useState(false);

  /* Igual que en /login: hasta que React no hidrata, un clic hace un envío
     nativo y el navegador recarga perdiendo lo escrito. */
  const [listo, setListo] = useState(false);
  useEffect(() => { setListo(true); }, []);

  const cortaLaContrasena = password.length > 0 && password.length < LONGITUD_MINIMA_PASSWORD;

  async function crearCuenta(evento) {
    evento.preventDefault();
    try {
      setEnviando(true);
      setError("");
      setYaRegistrado(false);

      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa, email, password, plan }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        setError(json.message || "No se pudo crear la cuenta.");
        setYaRegistrado(Boolean(json.yaRegistrado));
        return;
      }

      /* Salida del navegador hacia Stripe. No es una navegación de Next: la
         ruta responde con un 303 a checkout.stripe.com. */
      window.location.assign(json.siguiente || "/portal");
    } catch {
      setError("No se pudo crear la cuenta. Revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  const irAAcceder = `/login?next=${encodeURIComponent(`/api/suscripcion/iniciar?plan=${plan}`)}`;

  return (
    <div className={`v3-auth ${inter.className}`}>
      <div className="v3-bg" aria-hidden="true">
        <video autoPlay muted loop playsInline preload="none" poster="/fonts/poster.svg">
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>
      </div>

      <div className="v3-auth-card">
        <Link className="v3-logo" href="/" aria-label="Inicio" style={{ marginInline: "auto" }}>
          <Logo />
        </Link>

        <h1 className="v3-auth-title">Crea tu cuenta</h1>
        <p className="v3-auth-sub">
          Plan <strong>{PLANES[plan].nombre}</strong>, {PLANES[plan].precio} € al mes. Creas la cuenta ahora y pagas en el
          siguiente paso, con Stripe.
        </p>

        <form className="v3-auth-form" onSubmit={crearCuenta}>
          <div className="v3-field">
            <label className="v3-label" htmlFor="reg-empresa">Nombre de tu empresa</label>
            <input
              id="reg-empresa"
              className="v3-input"
              type="text"
              autoComplete="organization"
              placeholder="Instalaciones Vega"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              required
            />
          </div>

          <div className="v3-field">
            <label className="v3-label" htmlFor="reg-email">Correo</label>
            <input
              id="reg-email"
              className="v3-input"
              type="email"
              autoComplete="username"
              placeholder="tu@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="v3-field">
            <label className="v3-label" htmlFor="reg-pass">Contraseña</label>
            <input
              id="reg-pass"
              className="v3-input"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="v3-hint">
              {cortaLaContrasena
                ? `Te faltan ${LONGITUD_MINIMA_PASSWORD - password.length} caracteres.`
                : `Mínimo ${LONGITUD_MINIMA_PASSWORD} caracteres.`}
            </p>
          </div>

          <button className="v3-btn v3-btn--white" type="submit" disabled={enviando || !listo}>
            {enviando ? "Creando tu cuenta…" : "Crear cuenta y pagar"}
          </button>
        </form>

        <p className="v3-status" data-ok={error ? "false" : undefined} role="status" aria-live="polite">
          {error}
        </p>

        <p className="v3-auth-pie">
          {yaRegistrado ? (
            <Link className="v3-enlace" href={irAAcceder}>Entrar con esa cuenta y continuar</Link>
          ) : (
            <>¿Ya tienes cuenta? <Link className="v3-enlace" href={irAAcceder}>Entrar</Link></>
          )}
        </p>

        <p className="v3-auth-legal">
          Al crear la cuenta aceptas los{" "}
          <Link className="v3-enlace" href="/legal/terminos">términos</Link> y la{" "}
          <Link className="v3-enlace" href="/legal/privacidad">política de privacidad</Link>.
        </p>
      </div>
    </div>
  );
}
