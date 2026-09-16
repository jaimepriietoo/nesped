"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inter } from "next/font/google";
import { FondoNesped } from "@/components/nucleo/fondo";
import "@/components/v3/v3.css";
import { Logo } from "@/components/v3/chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/**
 * Restablecer la contraseña, en dos pasos y una sola pantalla.
 *
 * Sin token en la dirección: se pide el correo, y la respuesta es la misma
 * exista o no (el servidor no dice más). Con token: se elige la contraseña
 * nueva. Nada de aquí revela si una cuenta existe.
 */
function Restablecer() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);

  async function pedir(e) {
    e.preventDefault();
    setCargando(true); setError(""); setMensaje("");
    try {
      const res = await fetch("/api/login/recuperar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) { setError(json.message || "No se pudo pedir el enlace."); return; }
      setMensaje(json.message);
      setHecho(true);
      if (json.enlaceDePrueba) setMensaje(`${json.message} (Entorno de pruebas: ${json.enlaceDePrueba})`);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  async function cambiar(e) {
    e.preventDefault();
    if (password !== repetida) { setError("Las dos contraseñas no coinciden."); return; }
    setCargando(true); setError(""); setMensaje("");
    try {
      const res = await fetch("/api/login/restablecer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) { setError(json.message || "No se pudo cambiar la contraseña."); return; }
      setMensaje(json.message);
      setHecho(true);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  const estadoNucleo = error ? "ATTENTION" : hecho ? "ACTING" : cargando ? "THINKING" : escribiendo ? "LISTENING" : "IDLE";

  return (
    <div className="v3-auth">
      <FondoNesped estado={estadoNucleo} luz={0.92} sitio="izquierda" />
      <div className="v3-auth-card">
        <Link className="v3-logo" href="/" aria-label="Inicio" style={{ marginInline: "auto" }}><Logo /></Link>
        <h1 className="v3-auth-title">{token ? "Contraseña nueva" : "Recuperar el acceso"}</h1>
        <p className="v3-auth-sub">
          {token ? "Elige una contraseña nueva. Al guardarla se cerrarán las sesiones abiertas." : "Dinos tu correo y te mandamos un enlace para elegir una contraseña nueva."}
        </p>

        {hecho ? (
          <p className="v3-legal" style={{ marginTop: 8 }}>
            <Link href="/login" className="v3-btn v3-btn--white" style={{ display: "inline-block" }}>Ir a entrar</Link>
          </p>
        ) : token ? (
          <form className="v3-auth-form" onSubmit={cambiar}>
            <div className="v3-field">
              <label className="v3-label" htmlFor="r-pass">Contraseña nueva</label>
              <input id="r-pass" className="v3-input" type="password" autoComplete="new-password" minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} onFocus={() => setEscribiendo(true)} onBlur={() => setEscribiendo(false)} required />
            </div>
            <div className="v3-field">
              <label className="v3-label" htmlFor="r-pass2">Repítela</label>
              <input id="r-pass2" className="v3-input" type="password" autoComplete="new-password" minLength={8} value={repetida}
                onChange={(e) => setRepetida(e.target.value)} onFocus={() => setEscribiendo(true)} onBlur={() => setEscribiendo(false)} required />
            </div>
            <button className="v3-btn v3-btn--white" type="submit" disabled={cargando}>{cargando ? "Guardando…" : "Guardar contraseña"}</button>
          </form>
        ) : (
          <form className="v3-auth-form" onSubmit={pedir}>
            <div className="v3-field">
              <label className="v3-label" htmlFor="r-email">Correo</label>
              <input id="r-email" className="v3-input" type="email" autoComplete="username" placeholder="tu@empresa.com" value={email}
                onChange={(e) => setEmail(e.target.value)} onFocus={() => setEscribiendo(true)} onBlur={() => setEscribiendo(false)} required />
            </div>
            <button className="v3-btn v3-btn--white" type="submit" disabled={cargando || !email}>{cargando ? "Enviando…" : "Enviarme el enlace"}</button>
          </form>
        )}

        <p className="v3-status" data-ok={error ? "false" : mensaje ? "true" : undefined} role="status" aria-live="polite">{error || mensaje}</p>
        <p className="v3-legal"><Link href="/login">Volver a entrar</Link></p>
      </div>
    </div>
  );
}

export default function PaginaRestablecer() {
  return (
    <div className={`v3 ${inter.className}`}>
      <Suspense fallback={null}><Restablecer /></Suspense>
    </div>
  );
}
