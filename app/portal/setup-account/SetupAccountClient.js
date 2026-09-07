"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Logo } from "@/components/v3/chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

async function leerJson(res) {
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "La operación no se pudo completar.");
  }
  return json || {};
}

/**
 * Pantalla final del alta: quien acaba de pagar fija aquí sus credenciales.
 *
 * Es la primera cosa que ve un cliente nuevo después de pasar por caja, así
 * que va en el mismo lenguaje visual que el resto del sitio.
 */
export default function SetupAccountClient() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session_id") || "";

  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [contexto, setContexto] = useState({ productName: "", publicCheckout: false });
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;

    const url = sessionId
      ? `/api/portal/account/setup?session_id=${encodeURIComponent(sessionId)}`
      : "/api/portal/account/setup";

    fetch(url, { cache: "no-store" })
      .then(leerJson)
      .then((json) => {
        if (!vivo) return;
        setForm((p) => ({ ...p, email: json?.email || "" }));
        setContexto({
          productName: json?.productName || "",
          publicCheckout: Boolean(json?.publicCheckout),
        });
      })
      .catch((e) => {
        if (vivo) setError(e?.message || "No se pudo cargar la configuración.");
      });

    return () => { vivo = false; };
  }, [sessionId]);

  async function enviar(e) {
    e.preventDefault();

    if (!form.email || !form.password) {
      setError("Completa el email y la contraseña.");
      return;
    }
    if (form.password.length < 10) {
      setError("La contraseña necesita al menos 10 caracteres.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const json = await leerJson(
        await fetch("/api/portal/account/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password, sessionId }),
        })
      );

      setMensaje(json.message || "Cuenta guardada. Entrando…");

      // Pausa corta para que dé tiempo a leer el mensaje antes de saltar.
      window.setTimeout(() => {
        const destino = json.requiresTwoFactor
          ? `${json.redirectTo || "/login"}?next=${encodeURIComponent("/portal")}`
          : json.redirectTo || "/portal";
        router.push(destino);
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err?.message || "No se pudo guardar la cuenta.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className={`v3 v3-auth ${inter.className}`}>
      <div className="v3-auth-card">
        <Link className="v3-logo" href="/" aria-label="Inicio" style={{ marginInline: "auto" }}>
          <Logo />
        </Link>

        <h1 className="v3-auth-title">Crea tu acceso</h1>
        <p className="v3-auth-sub">
          {contexto.productName
            ? `Plan ${contexto.productName} activado. Sólo falta fijar tus credenciales.`
            : "Tu cuenta está lista. Sólo falta fijar tus credenciales."}
        </p>

        <form onSubmit={enviar} className="v3-auth-form">
          <div className="v3-field">
            <label className="v3-label" htmlFor="sa-email">Email</label>
            <input
              id="sa-email"
              className="v3-input"
              type="email"
              autoComplete="username"
              placeholder="cliente@empresa.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="v3-field">
            <label className="v3-label" htmlFor="sa-pass">Contraseña</label>
            <input
              id="sa-pass"
              className="v3-input"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 10 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <div className="v3-field">
            <label className="v3-label" htmlFor="sa-pass2">Repite la contraseña</label>
            <input
              id="sa-pass2"
              className="v3-input"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
          </div>

          <button className="v3-btn v3-btn--white" type="submit" disabled={cargando}>
            {cargando ? "Guardando…" : "Crear acceso y entrar"}
          </button>

          <p className="v3-status" data-ok={mensaje ? "true" : error ? "false" : undefined} role="status" aria-live="polite">
            {error || mensaje}
          </p>
        </form>

        <p className="v3-legal">
          ¿Ya tienes acceso? <Link href="/login">Entra por aquí</Link>
        </p>
      </div>
    </div>
  );
}
