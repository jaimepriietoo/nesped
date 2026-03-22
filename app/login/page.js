"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || "Login incorrecto");
        return;
      }

      router.push("/portal");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Error iniciando sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black text-xl font-bold">
            N
          </div>
          <h1 className="mt-4 text-3xl font-semibold">Acceso clientes</h1>
          <p className="mt-2 text-sm text-white/50">
            Entra al portal privado de NESPED
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-white/60">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
              placeholder="admin@nesped.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/60">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar al portal"}
          </button>
        </form>
      </div>
    </div>
  );
}