"use client";

import { useState } from "react";

export default function PricingPage() {
  const [clientId, setClientId] = useState("demo");
  const [email, setEmail] = useState("");
  const [loadingPlan, setLoadingPlan] = useState("");

  async function contratar(plan) {
    try {
      setLoadingPlan(plan);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          plan,
          email,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success || !json.url) {
        alert(json.message || "No se pudo abrir Stripe Checkout");
        return;
      }

      window.location.href = json.url;
    } catch (error) {
      console.error(error);
      alert("Error lanzando checkout");
    } finally {
      setLoadingPlan("");
    }
  }

  const plans = [
    { id: "basic", name: "Basic", price: "49€/mes", desc: "100 llamadas/mes" },
    { id: "pro", name: "Pro", price: "99€/mes", desc: "300 llamadas/mes" },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "199€/mes",
      desc: "Uso avanzado",
    },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-5xl font-semibold">Planes NESPED</h1>
        <p className="mt-4 text-white/60">
          Elige un plan y abre Stripe Checkout.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="clientId (ej: demo)"
            className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email de facturación"
            className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
          />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="text-2xl font-semibold">{plan.name}</div>
              <div className="mt-3 text-4xl font-semibold">{plan.price}</div>
              <div className="mt-2 text-white/60">{plan.desc}</div>

              <button
                onClick={() => contratar(plan.id)}
                disabled={loadingPlan === plan.id}
                className="mt-6 w-full rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
              >
                {loadingPlan === plan.id ? "Abriendo..." : "Contratar"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}