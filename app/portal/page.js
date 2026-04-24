"use client";

import { useEffect, useEffectEvent, useMemo, useState, useRef } from "react";
import {
  buildDerivedNotifications,
  buildBrandLabWorkspace,
  buildLeadTimeline,
  buildMessageExperimentSummary,
  buildOnboardingChecklist,
  buildOnboardingWorkspace,
  buildStrategySnapshot,
  buildRoiSnapshot,
  computeUsagePressure,
} from "@/lib/portal-product";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatSeconds(sec) {
  const n = Number(sec || 0);
  if (!n) return "0s";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60), s = n % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtEur(n) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n || 0));
}

function getScoreColor(score) {
  const n = Number(score || 0);
  if (n >= 80) return "var(--c-green)";
  if (n >= 50) return "var(--c-amber)";
  return "var(--c-red)";
}

function getScoreClass(score) {
  const n = Number(score || 0);
  if (n >= 80) return "green";
  if (n >= 50) return "amber";
  return "red";
}

function getInteresColor(interes) {
  const v = String(interes || "").toLowerCase();
  if (v === "alto") return "green";
  if (v === "medio") return "amber";
  return "red";
}

function getEstadoLabel(status) {
  return { new: "Nuevo", contacted: "Contactado", qualified: "Cualificado", won: "Ganado", lost: "Perdido" }[status] || status || "Nuevo";
}

function getEstadoColor(status) {
  return { new: "blue", contacted: "amber", qualified: "purple", won: "green", lost: "red" }[status] || "blue";
}

function getNextActionLabel(action) {
  return { call: "Llamar", whatsapp: "WhatsApp", sms: "SMS", wait: "Esperar" }[action] || "—";
}

function getNextActionColor(action) {
  return { call: "green", whatsapp: "blue", sms: "amber", wait: "default" }[action] || "default";
}

function getChannelLabel(channel) {
  return {
    whatsapp: "WhatsApp",
    voice: "Voz",
    billing: "Pago",
    system: "Sistema",
  }[String(channel || "").toLowerCase()] || "Actividad";
}

function getChannelColor(channel) {
  return {
    whatsapp: "green",
    voice: "purple",
    billing: "amber",
    system: "blue",
  }[String(channel || "").toLowerCase()] || "default";
}

function truncateText(value, max = 140) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function getPriorityColor(p) {
  return { urgente: "red", alta: "amber", media: "blue", baja: "default" }[String(p || "").toLowerCase()] || "default";
}

function getRecommendedProductTier(lead) {
  const score = Number(lead?.score || 0);
  const prob = Number(lead?.predicted_close_probability || 0);
  const value = Number(lead?.valor_estimado || 0);
  const interes = String(lead?.interes || "").toLowerCase();
  const nextAction = String(lead?.next_action || "").toLowerCase();
  if (prob >= 85 || score >= 85 || value >= 1000 || interes === "alto" || nextAction === "call") return "premium";
  if (prob >= 60 || score >= 60 || interes === "medio" || nextAction === "whatsapp") return "pro";
  return "basic";
}

function getProductTierColor(tier) {
  return { premium: "purple", pro: "blue" }[tier] || "default";
}

function getProductTierLabel(tier) {
  return { premium: "Premium", pro: "Pro", basic: "Basic" }[tier] || "Basic";
}

function normalizePhoneForWhatsApp(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function renderTemplateText(templateText, lead, clientBrand) {
  if (!templateText) return "";
  return String(templateText)
    .replace(/\{\{nombre\}\}/gi, lead?.nombre || "")
    .replace(/\{\{telefono\}\}/gi, lead?.telefono || "")
    .replace(/\{\{necesidad\}\}/gi, lead?.necesidad || "")
    .replace(/\{\{empresa\}\}/gi, clientBrand || "");
}

function getDefaultOutreachMessage(lead, clientBrand) {
  return lead?.next_step_ai || `Hola ${lead?.nombre || ""}, te escribimos de ${clientBrand || "nuestro equipo"} para continuar con tu solicitud.`;
}

function getLeadFormState(lead) {
  return {
    status: lead?.status || "new",
    owner: lead?.owner || "",
    notes: lead?.notes || "",
    proxima_accion: lead?.proxima_accion || "",
    ultima_accion: lead?.ultima_accion || "",
    valor_estimado: lead?.valor_estimado || "",
  };
}

async function readJsonResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.message || "Error en la solicitud.");
  return json;
}

function getSeverityColor(severity) {
  return {
    high: "red",
    medium: "amber",
    low: "blue",
    healthy: "green",
    warning: "amber",
    critical: "red",
  }[String(severity || "").toLowerCase()] || "default";
}

function getHealthLabel(level) {
  return {
    healthy: "Operativo",
    warning: "Atención",
    critical: "Crítico",
  }[String(level || "").toLowerCase()] || "Info";
}

const BRAND_THEME_PRESETS = [
  {
    id: "ocean",
    label: "Ocean premium",
    accent: "bg-blue-500/20",
    accent_text: "text-blue-300",
    button: "bg-white text-black hover:bg-white/90",
    badge: "bg-emerald-500/15 text-emerald-300",
  },
  {
    id: "graphite",
    label: "Graphite luxe",
    accent: "bg-white/10",
    accent_text: "text-white",
    button: "bg-zinc-100 text-black hover:bg-white/90",
    badge: "bg-white/10 text-white",
  },
  {
    id: "emerald",
    label: "Emerald signal",
    accent: "bg-emerald-500/20",
    accent_text: "text-emerald-300",
    button: "bg-emerald-300 text-black hover:bg-emerald-200",
    badge: "bg-cyan-500/15 text-cyan-300",
  },
  {
    id: "sunset",
    label: "Sunset premium",
    accent: "bg-amber-400/20",
    accent_text: "text-amber-200",
    button: "bg-amber-200 text-black hover:bg-amber-100",
    badge: "bg-rose-500/15 text-rose-300",
  },
];

function getBrandThemePresetId(form = {}) {
  return (
    BRAND_THEME_PRESETS.find(
      (preset) =>
        preset.accent === form?.accent &&
        preset.accent_text === form?.accent_text &&
        preset.button === form?.button &&
        preset.badge === form?.badge
    )?.id || "custom"
  );
}

function applyBrandThemePreset(form = {}, presetId = "ocean") {
  const preset =
    BRAND_THEME_PRESETS.find((item) => item.id === presetId) ||
    BRAND_THEME_PRESETS[0];

  return {
    ...(form || {}),
    accent: preset.accent,
    accent_text: preset.accent_text,
    button: preset.button,
    badge: preset.badge,
  };
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@300;400;500&family=Geist:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #05070a;
    --bg-1: rgba(11, 16, 22, 0.82);
    --bg-2: rgba(255,255,255,0.045);
    --bg-3: rgba(255,255,255,0.08);
    --border: rgba(255,255,255,0.08);
    --border-2: rgba(255,255,255,0.16);
    --text: #f7f8fb;
    --text-2: rgba(247,248,251,0.72);
    --text-3: rgba(247,248,251,0.42);
    --c-blue: #79a8ff;
    --c-green: #72dfb5;
    --c-amber: #f4c97f;
    --c-red: #ff8a8a;
    --c-purple: #b28dff;
    --c-cyan: #7fd8f0;
    --radius: 24px;
    --radius-sm: 16px;
    --font: 'Geist', sans-serif;
    --font-mono: 'Geist Mono', monospace;
    --font-serif: 'Instrument Serif', serif;
    --shadow: 0 28px 80px rgba(0,0,0,0.34);
    --glow-blue: 0 0 60px rgba(121,168,255,0.16);
    --glow-green: 0 0 60px rgba(114,223,181,0.12);
  }

  html, body {
    height: 100%;
    background:
      radial-gradient(circle at top left, rgba(121,168,255,0.16), transparent 24%),
      radial-gradient(circle at top right, rgba(114,223,181,0.12), transparent 18%),
      linear-gradient(180deg, #05070a 0%, #070a0f 100%);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 4px; }

  .portal {
    display: flex;
    height: 100vh;
    overflow: hidden;
    padding: 12px;
    gap: 12px;
    position: relative;
  }

  /* SIDEBAR */
  .sidebar {
    width: 232px; flex-shrink: 0; background: linear-gradient(180deg, rgba(15,20,27,0.92), rgba(8,12,18,0.78));
    border: 1px solid var(--border);
    border-radius: 28px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(24px);
    display: flex; flex-direction: column;
    padding: 20px 12px; gap: 4px; overflow-y: auto;
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; margin-bottom: 16px;
  }
  .sidebar-logo-icon {
    width: 32px; height: 32px; border-radius: 8px;
    background: linear-gradient(135deg, var(--c-blue), var(--c-purple));
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .sidebar-logo-name { font-size: 13px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
  .sidebar-logo-sub { font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }

  .nav-section { font-size: 10px; font-weight: 600; color: var(--text-3); letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 12px 4px; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; border-radius: var(--radius-sm);
    color: var(--text-2); font-size: 13px; font-weight: 500;
    cursor: pointer; transition: all 0.15s; border: none; background: none;
    width: 100%; text-align: left;
  }
  .nav-item:hover { background: rgba(255,255,255,0.06); color: var(--text); transform: translateX(2px); }
  .nav-item.active {
    background: linear-gradient(180deg, rgba(121,168,255,0.18), rgba(121,168,255,0.08));
    color: var(--c-blue);
    border: 1px solid rgba(121,168,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .nav-item .nav-icon { width: 16px; text-align: center; font-size: 14px; flex-shrink: 0; }
  .nav-badge { margin-left: auto; font-size: 10px; background: var(--c-red); color: #fff; padding: 1px 6px; border-radius: 999px; font-weight: 700; }

  /* MAIN */
  .main {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: linear-gradient(180deg, rgba(10,14,20,0.72), rgba(8,11,16,0.58));
    border: 1px solid var(--border);
    border-radius: 32px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(24px);
  }

  .topbar {
    min-height: 74px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 12px;
    padding: 0 24px; flex-shrink: 0; background: rgba(255,255,255,0.02);
  }
  .topbar-kicker { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-3); margin-bottom: 2px; }
  .topbar-title { font-size: 22px; font-weight: 600; color: var(--text); letter-spacing: -0.03em; }
  .topbar-search {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 999px; padding: 9px 14px;
    min-width: min(340px, 100%);
  }
  .topbar-search input {
    background: none; border: none; outline: none; color: var(--text);
    font-size: 13px; width: 220px; font-family: var(--font);
  }
  .topbar-search input::placeholder { color: var(--text-3); }
  .topbar-meta { display: flex; align-items: center; gap: 8px; }

  .content { flex: 1; overflow-y: auto; padding: 28px; }

  /* CARDS */
  .card {
    background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.035));
    border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px;
    backdrop-filter: blur(22px);
    box-shadow: 0 18px 40px rgba(0,0,0,0.16);
  }
  .card-sm {
    background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    backdrop-filter: blur(18px);
  }
  .card-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .card-title-right { margin-left: auto; }

  /* STAT CARDS */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .stat-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03));
    border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px 18px;
    position: relative; overflow: hidden; transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
    backdrop-filter: blur(18px);
  }
  .stat-card:hover { border-color: var(--border-2); transform: translateY(-2px); box-shadow: 0 16px 38px rgba(0,0,0,0.18); }
  .stat-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--accent, var(--c-blue)), transparent);
  }
  .stat-label { font-size: 11px; color: var(--text-3); font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px; }
  .stat-value { font-size: 24px; font-weight: 700; color: var(--text); font-family: var(--font-mono); line-height: 1; }
  .stat-sub { font-size: 11px; color: var(--text-3); margin-top: 4px; }

  /* BADGES */
  .badge {
    display: inline-flex; align-items: center;
    padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; font-family: var(--font-mono);
    white-space: nowrap; letter-spacing: 0.02em;
  }
  .badge.green { background: rgba(16,185,129,0.12); color: #34d399; border: 1px solid rgba(16,185,129,0.2); }
  .badge.amber { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.2); }
  .badge.red { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
  .badge.blue { background: rgba(59,130,246,0.12); color: #60a5fa; border: 1px solid rgba(59,130,246,0.2); }
  .badge.purple { background: rgba(139,92,246,0.12); color: #a78bfa; border: 1px solid rgba(139,92,246,0.2); }
  .badge.cyan { background: rgba(6,182,212,0.12); color: #22d3ee; border: 1px solid rgba(6,182,212,0.2); }
  .badge.default { background: rgba(255,255,255,0.06); color: var(--text-2); border: 1px solid var(--border); }

  /* BUTTONS */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 15px; border-radius: 999px;
    font-size: 12px; font-weight: 600; font-family: var(--font);
    cursor: pointer; transition: all 0.18s; border: none; white-space: nowrap;
  }
  .btn-primary { background: linear-gradient(180deg, #f5f8ff, #cfe0ff); color: #061018; box-shadow: 0 16px 36px rgba(121,168,255,0.22); }
  .btn-primary:hover { transform: translateY(-1px); }
  .btn-ghost { background: rgba(255,255,255,0.04); color: var(--text-2); border: 1px solid var(--border); backdrop-filter: blur(18px); }
  .btn-ghost:hover { background: rgba(255,255,255,0.08); color: var(--text); border-color: var(--border-2); transform: translateY(-1px); }
  .btn-green { background: linear-gradient(180deg, #9af2cd, #66d4a8); color: #04130d; box-shadow: 0 16px 34px rgba(114,223,181,0.18); }
  .btn-green:hover { transform: translateY(-1px); }
  .btn-red { background: var(--c-red); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* INPUTS */
  .input, .select, .textarea {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 18px; padding: 10px 14px;
    color: var(--text); font-size: 13px; font-family: var(--font);
    outline: none; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s; width: 100%;
    backdrop-filter: blur(14px);
  }
  .input:focus, .select:focus, .textarea:focus { border-color: rgba(121,168,255,0.4); box-shadow: 0 0 0 5px rgba(121,168,255,0.08); background: rgba(255,255,255,0.06); }
  .input::placeholder { color: var(--text-3); }
  .textarea { resize: vertical; line-height: 1.6; }
  .select option { background: var(--bg-2); }
  .input:disabled, .select:disabled, .textarea:disabled { opacity: 0.5; cursor: not-allowed; }

  /* TABLE */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead tr { border-bottom: 1px solid var(--border); }
  th { padding: 8px 12px; color: var(--text-3); font-weight: 600; text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
  tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.1s; }
  tbody tr:hover { background: var(--bg-2); }
  td { padding: 10px 12px; color: var(--text-2); vertical-align: middle; }
  td.bold { color: var(--text); font-weight: 600; }

  /* SCORE RING */
  .score-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; }

  /* PIPELINE KANBAN */
  .kanban { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
  .kanban-col {
    min-width: 200px; flex: 0 0 200px;
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 12px; transition: border-color 0.2s;
  }
  .kanban-col.drag-over { border-color: var(--c-blue); background: rgba(59,130,246,0.05); }
  .kanban-col-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .kanban-col-title { font-size: 12px; font-weight: 700; color: var(--text); }
  .kanban-col-value { font-size: 10px; color: var(--text-3); font-family: var(--font-mono); margin-top: 2px; }
  .kanban-card {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px; margin-bottom: 8px;
    cursor: pointer; transition: all 0.15s;
  }
  .kanban-card:hover { border-color: var(--border-2); transform: translateY(-1px); box-shadow: var(--shadow); }
  .kanban-card-name { font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .kanban-card-need { font-size: 11px; color: var(--text-3); margin-bottom: 8px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kanban-card-footer { display: flex; align-items: center; justify-content: space-between; }
  .kanban-card-value { font-size: 11px; font-family: var(--font-mono); color: var(--c-green); font-weight: 600; }

  /* DRAWER */
  .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; backdrop-filter: blur(4px); }
  .drawer {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(640px, 100vw);
    background: linear-gradient(180deg, rgba(11,16,22,0.95), rgba(7,10,15,0.9)); border-left: 1px solid var(--border);
    z-index: 101; display: flex; flex-direction: column;
    box-shadow: -20px 0 60px rgba(0,0,0,0.5);
    backdrop-filter: blur(26px);
  }
  .drawer-header {
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 12px; flex-shrink: 0;
  }
  .drawer-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
  .drawer-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .drawer-tab {
    padding: 10px 16px; font-size: 12px; font-weight: 600; color: var(--text-3);
    border: none; background: none; cursor: pointer; transition: all 0.15s;
    border-bottom: 2px solid transparent; margin-bottom: -1px; font-family: var(--font);
    letter-spacing: 0.05em; text-transform: uppercase;
  }
  .drawer-tab.active { color: var(--c-blue); border-bottom-color: var(--c-blue); }
  .drawer-tab:hover:not(.active) { color: var(--text-2); }

  /* GRID HELPERS */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .grid-auto { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .col-span-2 { grid-column: span 2; }

  /* FLEX HELPERS */
  .flex { display: flex; }
  .flex-col { display: flex; flex-direction: column; }
  .items-center { align-items: center; }
  .items-start { align-items: flex-start; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .gap-4 { gap: 16px; }
  .flex-1 { flex: 1; }
  .flex-wrap { flex-wrap: wrap; }

  /* SPACING */
  .mb-2 { margin-bottom: 8px; }
  .mb-3 { margin-bottom: 12px; }
  .mb-4 { margin-bottom: 16px; }
  .mt-2 { margin-top: 8px; }
  .mt-3 { margin-top: 12px; }
  .mt-4 { margin-top: 16px; }
  .p-4 { padding: 16px; }

  /* TEXT */
  .text-xs { font-size: 11px; }
  .text-sm { font-size: 12px; }
  .text-md { font-size: 14px; }
  .text-lg { font-size: 18px; }
  .text-xl { font-size: 22px; }
  .text-muted { color: var(--text-3); }
  .text-dim { color: var(--text-2); }
  .text-white { color: var(--text); }
  .text-mono { font-family: var(--font-mono); }
  .font-bold { font-weight: 700; }
  .font-semibold { font-weight: 600; }
  .text-green { color: var(--c-green); }
  .text-blue { color: var(--c-blue); }
  .text-amber { color: var(--c-amber); }
  .text-red { color: var(--c-red); }
  .text-purple { color: var(--c-purple); }
  .text-upper { text-transform: uppercase; letter-spacing: 0.08em; }
  .text-right { text-align: right; }

  /* SECTION HEADER */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .section-title { font-size: 15px; font-weight: 700; color: var(--text); }

  /* DIVIDER */
  .divider { height: 1px; background: var(--border); margin: 16px 0; }

  /* AUTOMATION CARD */
  .automation-card {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px; transition: all 0.2s;
  }
  .automation-card:hover { border-color: var(--border-2); }
  .automation-icon { font-size: 24px; margin-bottom: 10px; }
  .automation-name { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .automation-desc { font-size: 11px; color: var(--text-3); line-height: 1.5; margin-bottom: 14px; }

  /* CHART BAR */
  .bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 80px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .bar { border-radius: 4px 4px 0 0; width: 100%; transition: height 0.4s ease; min-height: 2px; }
  .bar-label { font-size: 9px; color: var(--text-3); font-family: var(--font-mono); white-space: nowrap; }
  .bar-val { font-size: 9px; color: var(--text-2); font-family: var(--font-mono); }

  /* EMPTY STATE */
  .empty { text-align: center; padding: 40px; color: var(--text-3); font-size: 13px; }

  /* ALERT */
  .alert { padding: 12px 16px; border-radius: var(--radius-sm); font-size: 12px; border: 1px solid; }
  .alert-success { background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.2); color: #34d399; }
  .alert-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: #f87171; }
  .alert-info { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.2); color: #60a5fa; }

  /* CHECKBOX */
  input[type="checkbox"] { accent-color: var(--c-blue); width: 14px; height: 14px; cursor: pointer; }

  /* SCROLLABLE X */
  .scroll-x { overflow-x: auto; }

  /* LOADING */
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* MINI DOTS */
  .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .dot.green { background: var(--c-green); }
  .dot.amber { background: var(--c-amber); }
  .dot.red { background: var(--c-red); }
  .dot.blue { background: var(--c-blue); }

  /* PIPELINE ROW */
  .pipeline-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .pipeline-row:last-child { border-bottom: none; }

  /* PROGRESS BAR */
  .progress-bar { height: 4px; border-radius: 999px; background: var(--bg-3); overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }

  /* FADE IN */
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .fade-up { animation: fadeUp 0.25s ease; }

  /* MODAL */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .modal { background: linear-gradient(180deg, rgba(11,16,22,0.94), rgba(7,10,15,0.92)); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; width: min(520px, 100%); max-height: 85vh; overflow-y: auto; box-shadow: 0 40px 80px rgba(0,0,0,0.6); backdrop-filter: blur(26px); }
  .modal-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }

  /* TOGGLE */
  .toggle-group { display: flex; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px; }
  .toggle-btn { padding: 5px 14px; border-radius: 8px; border: none; background: none; color: var(--text-3); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: var(--font); }
  .toggle-btn.active { background: var(--bg-3); color: var(--text); }

  @media (max-width: 768px) {
    .sidebar { display: none; }
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    .col-span-2 { grid-column: span 1; }
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 40 }) {
  const n = Number(score || 0);
  const r = (size / 2) - 4;
  const c = 2 * Math.PI * r;
  const dash = (n / 100) * c;
  const color = getScoreColor(n);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${c}`} strokeDashoffset={c / 4} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fill={color}
        fontSize={size < 40 ? "9" : "11"} fontWeight="700" fontFamily="'Geist Mono', monospace">{n}</text>
    </svg>
  );
}

function Badge({ children, color = "default" }) {
  return <span className={`badge ${color}`}>{children}</span>;
}

function StatCard({ title, value, sub, accent = "var(--c-blue)", icon }) {
  return (
    <div className="stat-card" style={{ "--accent": accent }}>
      <div className="stat-label">{icon && <span style={{ marginRight: 4 }}>{icon}</span>}{title}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function BarChart({ data, color = "var(--c-blue)" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((item, i) => (
        <div key={i} className="bar-col">
          <span className="bar-val">{item.value}</span>
          <div style={{ width: "100%", display: "flex", alignItems: "flex-end", flex: 1 }}>
            <div className="bar" style={{ background: color, height: `${Math.max((item.value / max) * 60, item.value > 0 ? 4 : 2)}px` }} />
          </div>
          <span className="bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── LEAD DRAWER ──────────────────────────────────────────────────────────────

function LeadDrawer({ lead, events, notes, comments, reminders, call, users, canEdit, sendingSms, smsTemplates, whatsappTemplates, clientBrand, selectedLeadMemory, onClose, onSave, onAddNote, onAddComment, onAddReminder, onGenerateNextStep, onSendFollowupSms, onSaveNextBestAction, onExecuteRecommendedAction, onOpenCheckout, onRunVoiceCalls, onRecalculatePriority }) {
  const [tab, setTab] = useState("datos");
  const [form, setForm] = useState(() => getLeadFormState(lead));
  const [noteBody, setNoteBody] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState(smsTemplates?.[0]?.id || "");
  const [selectedWhatsappTemplateId, setSelectedWhatsappTemplateId] = useState(whatsappTemplates?.[0]?.id || "");
  const [outreachMessage, setOutreachMessage] = useState(() => lead ? getDefaultOutreachMessage(lead, clientBrand) : "");

  if (!lead) return null;

  const selectedSmsTemplate = (smsTemplates || []).find(t => t.id === selectedSmsTemplateId) || null;
  const selectedWhatsappTemplate = (whatsappTemplates || []).find(t => t.id === selectedWhatsappTemplateId) || null;

  const tier = getRecommendedProductTier(lead);
  const timelineItems = buildLeadTimeline({
    call,
    events,
    notes,
    comments,
    reminders,
  });
  const tabs = ["datos", "ia", "timeline", "historial", "mensajes", "llamada"];

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer fade-up">
        {/* Header */}
        <div className="drawer-header">
          <div className="flex items-start justify-between gap-3">
            <div style={{ flex: 1 }}>
              <div className="text-xs text-muted text-upper mb-2">Ficha del lead · {formatDate(lead.created_at)}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{lead.nombre || "Sin nombre"}</div>
              <div className="text-sm text-dim mt-2">{lead.email || lead.telefono || "—"}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={onRunVoiceCalls} className="btn btn-ghost btn-sm">📞 Llamadas IA</button>
              <button onClick={onRecalculatePriority} className="btn btn-ghost btn-sm">⚡ Prioridad</button>
              <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <ScoreRing score={lead.score} size={44} />
            <Badge color={getScoreClass(lead.score)}>Score {lead.score || 0}</Badge>
            <Badge color={getEstadoColor(lead.status)}>{getEstadoLabel(lead.status)}</Badge>
            <Badge color={getInteresColor(lead.interes)}>{lead.interes || "medio"}</Badge>
            <Badge color="green">{lead.predicted_close_probability || 0}% cierre</Badge>
            <Badge color={getProductTierColor(tier)}>{getProductTierLabel(tier)}</Badge>
            {lead.followup_sms_sent && <Badge color="amber">SMS ✓</Badge>}
            {lead.owner && <Badge color="default">👤 {lead.owner}</Badge>}
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          {tabs.map(t => (
            <button key={t} className={`drawer-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="drawer-body">

          {/* TAB: DATOS */}
          {tab === "datos" && (
            <>
              <div className="grid-2">
                {[["Nombre", lead.nombre], ["Teléfono", lead.telefono], ["Ciudad", lead.ciudad], ["Fuente", lead.fuente || lead.origen]].map(([k, v]) => (
                  <div key={k} className="card-sm">
                    <div className="text-xs text-muted mb-2">{k}</div>
                    <div className="text-sm font-semibold">{v || "—"}</div>
                  </div>
                ))}
              </div>
              <div className="card-sm">
                <div className="text-xs text-muted mb-2">Necesidad</div>
                <div className="text-sm text-dim">{lead.necesidad || "—"}</div>
              </div>
              <div className="card-sm" style={{ borderColor: "rgba(59,130,246,0.2)", background: "rgba(59,130,246,0.04)" }}>
                <div className="text-xs text-muted mb-2">Siguiente paso IA</div>
                <div className="text-sm text-dim">{lead.next_step_ai || "—"}</div>
              </div>
              <div className="card-sm" style={{ borderColor: "rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.04)" }}>
                <div className="text-xs text-muted mb-2">Acción recomendada</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge color={getNextActionColor(lead.next_action)}>{getNextActionLabel(lead.next_action)}</Badge>
                  <Badge color={getPriorityColor(lead.next_action_priority)}>{lead.next_action_priority || "—"}</Badge>
                </div>
                <div className="text-sm text-dim">{lead.next_action_reason || "—"}</div>
              </div>
              <div className="card-sm">
                <div className="text-xs text-muted mb-2">Mensaje recomendado</div>
                <div className="text-sm text-dim" style={{ fontStyle: "italic" }}>
                  &quot;{lead.next_action_message || "—"}&quot;
                </div>
              </div>
              <div className="card-sm" style={{ borderColor: "rgba(16,185,129,0.2)" }}>
                <div className="text-xs text-muted mb-3">Memoria IA</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge color="purple">Intent: {selectedLeadMemory?.last_intent || "—"}</Badge>
                  <Badge color="amber">Objeción: {selectedLeadMemory?.last_objection || "—"}</Badge>
                  <Badge color="blue">Temp: {selectedLeadMemory?.temperature || "—"}</Badge>
                  <Badge color="green">Producto: {selectedLeadMemory?.recommended_product || "—"}</Badge>
                </div>
                <div className="text-sm text-dim">{selectedLeadMemory?.last_summary || "Sin memoria IA todavía."}</div>
              </div>

              {/* Editar */}
              <div className="card-sm">
                <div className="text-xs text-muted mb-3">Editar lead</div>
                <div className="grid-2" style={{ gap: 10 }}>
                  <div>
                    <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Estado</label>
                    <select disabled={!canEdit} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="select">
                      {[["new","Nuevo"],["contacted","Contactado"],["qualified","Cualificado"],["won","Ganado"],["lost","Perdido"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Responsable</label>
                    <select disabled={!canEdit} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="select">
                      <option value="">Sin asignar</option>
                      {users.map(u => <option key={u.id} value={u.full_name}>{u.full_name} ({u.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Valor estimado (€)</label>
                    <input disabled={!canEdit} value={form.valor_estimado} onChange={e => setForm(f => ({ ...f, valor_estimado: e.target.value }))} className="input" />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Última acción</label>
                    <input disabled={!canEdit} value={form.ultima_accion} onChange={e => setForm(f => ({ ...f, ultima_accion: e.target.value }))} className="input" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Próxima acción</label>
                    <input disabled={!canEdit} value={form.proxima_accion} onChange={e => setForm(f => ({ ...f, proxima_accion: e.target.value }))} className="input" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Notas</label>
                    <textarea disabled={!canEdit} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="textarea" />
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-wrap gap-2">
                <a href={lead.telefono ? `tel:${lead.telefono}` : "#"} className="btn btn-primary">📞 Llamar</a>
                <button onClick={() => navigator.clipboard.writeText(lead.telefono || "")} className="btn btn-ghost">Copiar tel.</button>
                {canEdit && <>
                  <button onClick={() => setForm(f => ({ ...f, status: "contacted", ultima_accion: "Marcado como contactado" }))} className="btn btn-ghost">✓ Contactado</button>
                  <button onClick={() => onGenerateNextStep(lead)} className="btn btn-ghost">🤖 Generar paso IA</button>
                  <button onClick={() => onSaveNextBestAction(lead)} className="btn btn-ghost">⚡ Calcular acción</button>
                  <button onClick={() => onExecuteRecommendedAction(lead)} className="btn btn-ghost">▶ Ejecutar acción</button>
                  <button onClick={() => onOpenCheckout(lead)} className="btn btn-green">💳 Cobrar con IA</button>
                  <button onClick={() => onSave(lead.id, form)} className="btn btn-primary">💾 Guardar</button>
                </>}
              </div>
            </>
          )}

          {/* TAB: IA */}
          {tab === "ia" && (
            <>
              <div className="card-sm" style={{ borderColor: "rgba(139,92,246,0.25)", background: "rgba(139,92,246,0.05)" }}>
                <div className="text-xs text-muted mb-3 text-upper">Next Best Action</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge color={getNextActionColor(lead.next_action)}>{getNextActionLabel(lead.next_action)}</Badge>
                  <Badge color={getPriorityColor(lead.next_action_priority)}>{lead.next_action_priority || "—"}</Badge>
                  {lead.next_action_priority === "urgente" && <Badge color="red">🔥 URGENTE</Badge>}
                </div>
                <div className="text-sm text-dim mb-3">{lead.next_action_reason || "Sin análisis IA todavía."}</div>
                <div className="card-sm" style={{ background: "rgba(0,0,0,0.2)" }}>
                  <div className="text-xs text-muted mb-1">Mensaje listo para enviar</div>
                  <div className="text-sm text-dim" style={{ fontStyle: "italic" }}>
                    &quot;{lead.next_action_message || "—"}&quot;
                  </div>
                </div>
              </div>
              <div className="card-sm" style={{ borderColor: "rgba(16,185,129,0.2)" }}>
                <div className="text-xs text-muted mb-3 text-upper">Memoria IA del lead</div>
                <div className="grid-2" style={{ gap: 8, marginBottom: 12 }}>
                  {[["Intent", selectedLeadMemory?.last_intent, "purple"], ["Objeción", selectedLeadMemory?.last_objection, "amber"], ["Temperatura", selectedLeadMemory?.temperature, "blue"], ["Producto", selectedLeadMemory?.recommended_product, "green"]].map(([k, v, c]) => (
                    <div key={k} className="card-sm" style={{ background: "rgba(0,0,0,0.2)" }}>
                      <div className="text-xs text-muted mb-1">{k}</div>
                      <Badge color={c}>{v || "—"}</Badge>
                    </div>
                  ))}
                </div>
                <div className="text-sm text-dim">{selectedLeadMemory?.last_summary || "Sin memoria IA todavía."}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && <>
                  <button onClick={() => onGenerateNextStep(lead)} className="btn btn-primary">🤖 Generar siguiente paso</button>
                  <button onClick={() => onSaveNextBestAction(lead)} className="btn btn-ghost">⚡ Calcular acción</button>
                  <button onClick={() => onExecuteRecommendedAction(lead)} className="btn btn-ghost">▶ Ejecutar</button>
                </>}
              </div>
            </>
          )}

          {/* TAB: TIMELINE */}
          {tab === "timeline" && (
            <>
              <div className="card-sm" style={{ borderColor: "rgba(59,130,246,0.22)" }}>
                <div className="text-xs text-muted mb-2 text-upper">Timeline unificada del lead</div>
                <div className="text-sm text-dim">Vista única de llamadas, eventos, notas, comentarios y recordatorios ordenados en el tiempo.</div>
              </div>
              {timelineItems.length === 0 ? <div className="empty">Sin actividad registrada todavía.</div> : timelineItems.map(item => (
                <div key={item.id} className="card-sm mb-2" style={{ borderColor: `var(--c-${item.accent || "blue"})` }}>
                  <div className="flex justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge color={item.accent || "blue"}>{item.type}</Badge>
                      <div className="text-sm font-semibold">{item.title}</div>
                    </div>
                    <div className="text-xs text-muted">{formatDate(item.created_at)}</div>
                  </div>
                  <div className="text-sm text-dim">{item.body || "—"}</div>
                </div>
              ))}
            </>
          )}

          {/* TAB: HISTORIAL */}
          {tab === "historial" && (
            <>
              <div className="card-sm">
                <div className="text-xs text-muted mb-3 text-upper">Añadir nota</div>
                {canEdit && (
                  <div className="flex-col gap-2" style={{ display: "flex" }}>
                    <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} rows={3} placeholder="Nota interna..." className="textarea" />
                    <button onClick={() => { if (!noteBody.trim()) return; onAddNote(lead.id, noteBody); setNoteBody(""); }} className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>Añadir nota</button>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted mb-3 text-upper">Notas ({notes.length})</div>
                {notes.length === 0 ? <div className="empty">Sin notas</div> : notes.map(n => (
                  <div key={n.id} className="card-sm mb-2">
                    <div className="flex justify-between mb-2"><span className="text-sm font-semibold">{n.author || "Usuario"}</span><span className="text-xs text-muted">{formatDate(n.created_at)}</span></div>
                    <div className="text-sm text-dim">{n.body}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs text-muted mb-3 text-upper">Comentarios ({comments.length})</div>
                {canEdit && (
                  <div className="flex-col gap-2 mb-3" style={{ display: "flex" }}>
                    <textarea value={commentBody} onChange={e => setCommentBody(e.target.value)} rows={2} placeholder="Comentario..." className="textarea" />
                    <button onClick={() => { if (!commentBody.trim()) return; onAddComment(lead.id, commentBody); setCommentBody(""); }} className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>Añadir comentario</button>
                  </div>
                )}
                {comments.length === 0 ? <div className="empty">Sin comentarios</div> : comments.map(c => (
                  <div key={c.id} className="card-sm mb-2">
                    <div className="flex justify-between mb-2"><span className="text-sm font-semibold">{c.author || "Usuario"}</span><span className="text-xs text-muted">{formatDate(c.created_at)}</span></div>
                    <div className="text-sm text-dim">{c.body}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs text-muted mb-3 text-upper">Recordatorios ({reminders.length})</div>
                {canEdit && (
                  <div className="flex-col gap-2 mb-3" style={{ display: "flex" }}>
                    <input value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} placeholder="Título del recordatorio" className="input" />
                    <input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)} className="input" />
                    <button onClick={() => { if (!reminderTitle.trim() || !reminderAt) return; onAddReminder(lead.id, reminderTitle, reminderAt, form.owner); setReminderTitle(""); setReminderAt(""); }} className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>+ Recordatorio</button>
                  </div>
                )}
                {reminders.length === 0 ? <div className="empty">Sin recordatorios</div> : reminders.map(r => (
                  <div key={r.id} className="card-sm mb-2">
                    <div className="font-semibold text-sm mb-1">{r.title}</div>
                    <div className="text-xs text-muted">{formatDate(r.remind_at)} · {r.assigned_to || "—"}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs text-muted mb-3 text-upper">Eventos del sistema ({events.length})</div>
                {events.length === 0 ? <div className="empty">Sin eventos</div> : events.map(e => (
                  <div key={e.id} className="card-sm mb-2">
                    <div className="flex justify-between mb-1"><span className="text-sm font-semibold">{e.title}</span><span className="text-xs text-muted">{formatDate(e.created_at)}</span></div>
                    <div className="text-sm text-dim">{e.description || "—"}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* TAB: MENSAJES */}
          {tab === "mensajes" && (
            <>
              <div className="card-sm">
                <div className="text-xs text-muted mb-3 text-upper">Plantilla SMS</div>
                <div className="flex-col gap-2" style={{ display: "flex" }}>
                  <select value={selectedSmsTemplateId} onChange={e => setSelectedSmsTemplateId(e.target.value)} className="select">
                    <option value="">Selecciona plantilla SMS</option>
                    {(smsTemplates || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => { const text = renderTemplateText(selectedSmsTemplate?.text, lead, clientBrand); if (text) setOutreachMessage(text); }} className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>Aplicar SMS</button>
                </div>
              </div>
              <div className="card-sm">
                <div className="text-xs text-muted mb-3 text-upper">Plantilla WhatsApp</div>
                <div className="flex-col gap-2" style={{ display: "flex" }}>
                  <select value={selectedWhatsappTemplateId} onChange={e => setSelectedWhatsappTemplateId(e.target.value)} className="select">
                    <option value="">Selecciona plantilla WhatsApp</option>
                    {(whatsappTemplates || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => { const text = renderTemplateText(selectedWhatsappTemplate?.text, lead, clientBrand); if (text) setOutreachMessage(text); }} className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>Aplicar WhatsApp</button>
                </div>
              </div>
              <div className="card-sm">
                <div className="text-xs text-muted mb-3 text-upper">Mensaje</div>
                <textarea value={outreachMessage} onChange={e => setOutreachMessage(e.target.value)} rows={6} className="textarea mb-3" placeholder="Escribe o genera tu mensaje..." />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setOutreachMessage(getDefaultOutreachMessage(lead, clientBrand))} className="btn btn-ghost btn-sm">↺ Restablecer</button>
                  <button onClick={async () => { try { await navigator.clipboard.writeText(outreachMessage); } catch { alert("No se pudo copiar"); } }} className="btn btn-ghost btn-sm">📋 Copiar</button>
                  {canEdit && <button onClick={() => onSendFollowupSms(lead, outreachMessage, selectedSmsTemplateId)} disabled={sendingSms} className="btn btn-ghost btn-sm">{sendingSms ? "Enviando..." : "📱 Enviar SMS"}</button>}
                  <button onClick={() => { const phone = normalizePhoneForWhatsApp(lead.telefono); if (!phone) { alert("Sin teléfono válido"); return; } window.open(`https://wa.me/${phone}?text=${encodeURIComponent(outreachMessage)}`, "_blank"); }} className="btn btn-primary btn-sm">💬 WhatsApp</button>
                </div>
              </div>
            </>
          )}

          {/* TAB: LLAMADA */}
          {tab === "llamada" && (
            <>
              {call ? (
                <>
                  <div className="grid-3">
                    <div className="card-sm"><div className="text-xs text-muted mb-1">Fecha</div><div className="text-sm">{formatDate(call.created_at)}</div></div>
                    <div className="card-sm"><div className="text-xs text-muted mb-1">Duración</div><div className="text-sm">{formatSeconds(call.duration_seconds)}</div></div>
                    <div className="card-sm"><div className="text-xs text-muted mb-1">Estado</div><Badge color="blue">{call.status || "—"}</Badge></div>
                  </div>
                  <div className="card-sm"><div className="text-xs text-muted mb-2">Resumen</div><div className="text-sm text-dim">{call.summary || "—"}</div></div>
                  {call.summary_long && <div className="card-sm"><div className="text-xs text-muted mb-2">Resumen detallado</div><div className="text-sm text-dim">{call.summary_long}</div></div>}
                  {call.recording_url ? (
                    <div className="card-sm"><div className="text-xs text-muted mb-2">Grabación</div><audio controls style={{ width: "100%", marginTop: 8 }}><source src={call.recording_url} /></audio></div>
                  ) : <div className="card-sm text-muted text-sm">Sin grabación disponible.</div>}
                  {call.transcript && <div className="card-sm"><div className="text-xs text-muted mb-2">Transcripción</div><pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>{call.transcript}</pre></div>}
                </>
              ) : (
                <div className="empty" style={{ paddingTop: 60 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📞</div>
                  <div className="text-sm text-muted">No hay llamada asociada a este lead.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────

function DashboardView({ data, filteredLeads, revenue, voiceStats, priorityStats, reactivationStats, leadRevenue, ownerRevenue, upsellStats, appointmentStats, billingData, healthData, onboarding, notifications, usagePressure, onOpenLead, onOpenCheckout, exportCsv, openCheckout, openBillingPortal, billingLoading, onNavigate, sendDailyReport, sendWeeklyReport, runNightly, recalculateAllNextActions, runAutomaticFunnel, recalculateDynamicScoring, runColdLeadReactivation }) {
  const { metrics = {}, rankings = { bestDays: [], bestHours: [] }, client = {}, settings = {} } = data;
  const chartCalls = rankings.bestDays.length ? rankings.bestDays.map(d => ({ label: d.label, value: d.calls })) : [{ label: "—", value: 0 }];
  const chartLeads = rankings.bestDays.length ? rankings.bestDays.map(d => ({ label: d.label, value: d.leads })) : [{ label: "—", value: 0 }];
  const hotLeads = filteredLeads.filter(l => Number(l.score || 0) >= 80).sort((a, b) => b.score - a.score).slice(0, 5);

  return (
    <div className="fade-up">
      {/* Top actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => openCheckout("pro")} disabled={billingLoading} className="btn btn-primary">{billingLoading ? "Abriendo..." : "⬆ Contratar/Ampliar plan"}</button>
        <button onClick={openBillingPortal} disabled={billingLoading} className="btn btn-ghost">💳 Facturación</button>
        <button onClick={exportCsv} className="btn btn-ghost">📥 Exportar CSV</button>
        <button onClick={sendDailyReport} className="btn btn-ghost">📊 Informe diario</button>
        <button onClick={sendWeeklyReport} className="btn btn-ghost">📈 Informe semanal</button>
        <button onClick={runNightly} className="btn btn-ghost">🌙 Proceso nocturno</button>
        <button onClick={recalculateAllNextActions} className="btn btn-ghost">🤖 Recalcular acciones</button>
        <button onClick={runAutomaticFunnel} className="btn btn-ghost">⚡ Funnel auto</button>
        <button onClick={recalculateDynamicScoring} className="btn btn-ghost">🎯 Recalcular scoring</button>
        <button onClick={runColdLeadReactivation} className="btn btn-ghost">🔥 Reactivar fríos</button>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">🚀 Onboarding guiado <div className="card-title-right"><Badge color={onboarding?.progress >= 100 ? "green" : "blue"}>{onboarding?.progress || 0}%</Badge></div></div>
          <div className="mb-3">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${onboarding?.progress || 0}%`, background: "var(--c-blue)" }} /></div>
          </div>
          {onboarding?.items?.slice(0, 5).map(item => (
            <div key={item.id} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-xs text-dim">{item.detail}</div>
              </div>
              <Badge color={item.done ? "green" : "amber"}>{item.done ? "Hecho" : "Pendiente"}</Badge>
            </div>
          ))}
          {onboarding?.nextStep && (
            <button onClick={() => onNavigate(onboarding.nextStep.view || "settings")} className="btn btn-primary btn-sm mt-3">
              Ir al siguiente paso
            </button>
          )}
        </div>

        <div className="card">
          <div className="card-title">🔔 Centro de prioridades <div className="card-title-right"><Badge color={notifications?.length ? "red" : "green"}>{notifications?.length || 0}</Badge></div></div>
          {notifications?.length ? notifications.slice(0, 5).map(item => (
            <div key={item.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <Badge color={getSeverityColor(item.severity)}>{item.severity}</Badge>
              </div>
              <div className="text-xs text-dim mb-2">{item.body}</div>
              <button onClick={() => onNavigate(item.view || "notifications")} className="btn btn-ghost btn-sm">Abrir</button>
            </div>
          )) : <div className="empty">Todo bastante controlado ahora mismo.</div>}
        </div>
      </div>

      {/* Core metrics */}
      <div className="stat-grid">
        <StatCard title="Llamadas" value={metrics.totalCalls || 0} sub="Histórico total" accent="var(--c-blue)" />
        <StatCard title="Leads" value={metrics.totalLeads || 0} sub="Capturados" accent="var(--c-green)" />
        <StatCard title="Conversión" value={`${metrics.conversionRate || 0}%`} sub="Leads / Llamadas" accent="var(--c-amber)" />
        <StatCard title="Score medio" value={metrics.avgLeadScore || 0} sub="Calidad media" accent="var(--c-purple)" />
        <StatCard title="Potencial" value={fmtEur(metrics.totalPotentialRevenue || 0)} sub="Estimación pipeline" accent="var(--c-green)" />
        <StatCard title="Sin asignar" value={metrics.unassignedLeads || 0} sub="Leads sin owner" accent="var(--c-red)" />
      </div>

      {/* Revenue */}
      {revenue && (
        <div className="stat-grid mb-4">
          <StatCard title="Ingresos totales" value={fmtEur(revenue.total)} sub="Histórico" accent="var(--c-green)" />
          <StatCard title="Hoy" value={fmtEur(revenue.today)} sub="Ingresos hoy" accent="var(--c-blue)" />
          <StatCard title="Esta semana" value={fmtEur(revenue.week)} sub="Últimos 7 días" accent="var(--c-amber)" />
          <StatCard title="Ticket medio" value={fmtEur(revenue.avgTicket)} sub="Por venta" accent="var(--c-purple)" />
          <StatCard title="Nº ventas" value={revenue.count || 0} sub="Total" accent="var(--c-cyan)" />
        </div>
      )}

      {/* Charts + Hot leads */}
      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">📞 Llamadas por día</div>
          <BarChart data={chartCalls} color="var(--c-blue)" />
        </div>
        <div className="card">
          <div className="card-title">👥 Leads por día</div>
          <BarChart data={chartLeads} color="var(--c-green)" />
        </div>
      </div>

      {/* Hot leads */}
      <div className="card mb-4">
        <div className="card-title">🔥 Leads más calientes
          <div className="card-title-right"><Badge color="red">{hotLeads.length} urgentes</Badge></div>
        </div>
        {hotLeads.length === 0 ? <div className="empty">Sin leads calientes con los filtros actuales.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lead</th><th>Score</th><th>Estado</th><th>Acción</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {hotLeads.map(lead => (
                  <tr key={lead.id}>
                    <td className="bold">{lead.nombre}<div className="text-xs text-muted">{lead.necesidad}</div></td>
                    <td><ScoreRing score={lead.score} size={32} /></td>
                    <td><Badge color={getEstadoColor(lead.status)}>{getEstadoLabel(lead.status)}</Badge></td>
                    <td><Badge color={getNextActionColor(lead.next_action)}>{getNextActionLabel(lead.next_action)}</Badge></td>
                    <td className="text-green text-mono">{fmtEur(lead.valor_estimado)}</td>
                    <td><button onClick={() => onOpenLead(lead)} className="btn btn-ghost btn-sm">Ver →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-3 mb-4">
        <div className="card-sm">
          <div className="text-xs text-muted mb-1">Facturación</div>
          <div className="text-md font-bold text-white">{billingData?.activeSubscription?.status || (client.stripe_customer_id ? "Stripe listo" : "Sin activar")}</div>
          <div className="text-xs text-dim mt-2">{billingData?.lastInvoice ? `Última factura ${fmtEur(billingData.lastInvoice.amount)}` : "Sin facturas todavía"}</div>
        </div>
        <div className="card-sm">
          <div className="text-xs text-muted mb-1">Salud del sistema</div>
          <div className="flex items-center gap-2"><Badge color={getSeverityColor(healthData?.summary?.level)}>{getHealthLabel(healthData?.summary?.level)}</Badge></div>
          <div className="text-xs text-dim mt-2">{healthData?.summary?.message || "Sin diagnóstico cargado"}</div>
        </div>
        <div className="card-sm">
          <div className="text-xs text-muted mb-1">Uso del plan</div>
          <div className="text-md font-bold text-white">{usagePressure?.callsLimit ? `${usagePressure.usagePercent}%` : "Sin límite"}</div>
          <div className="text-xs text-dim mt-2">{usagePressure?.recommendation || "Sin recomendación aún"}</div>
        </div>
      </div>

      {/* Voice + Priority + Reactivation */}
      <div className="grid-3 mb-4">
        {voiceStats && (
          <div className="card">
            <div className="card-title">📞 Llamadas IA</div>
            {[["Total", voiceStats.total, "blue"], ["Útiles", voiceStats.useful, "green"], ["Cierres por voz", voiceStats.closedByVoice, "purple"]].map(([k, v, c]) => (
              <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><Badge color={c}>{v || 0}</Badge></div>
            ))}
          </div>
        )}
        {priorityStats && (
          <div className="card">
            <div className="card-title">⚡ Prioridad IA</div>
            {[["Urgente", priorityStats.urgente, "red"], ["Alta", priorityStats.alta, "amber"], ["Media", priorityStats.media, "blue"], ["Baja", priorityStats.baja, "default"]].map(([k, v, c]) => (
              <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><Badge color={c}>{v || 0}</Badge></div>
            ))}
          </div>
        )}
        {reactivationStats && (
          <div className="card">
            <div className="card-title">🔄 Reactivaciones</div>
            {[["Total", reactivationStats.total, "blue"], ["Últimas 24h", reactivationStats.last24h, "green"], ["Stage 3d", reactivationStats.byStage?.["3d"], "amber"], ["Stage 7d", reactivationStats.byStage?.["7d"], "purple"]].map(([k, v, c]) => (
              <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><Badge color={c}>{v || 0}</Badge></div>
            ))}
          </div>
        )}
      </div>

      {/* Plan info */}
      <div className="grid-3">
        <div className="card-sm"><div className="text-xs text-muted mb-1">Plan actual</div><div className="text-md font-bold text-white">{client.plan || "pro"}</div></div>
        <div className="card-sm"><div className="text-xs text-muted mb-1">Límite llamadas</div><div className="text-md font-bold text-white">{client.calls_limit || client.callsLimit || 0}</div></div>
        <div className="card-sm"><div className="text-xs text-muted mb-1">Estado</div><Badge color={client.is_active === false ? "red" : "green"}>{client.is_active === false ? "Inactivo" : "Activo"}</Badge></div>
      </div>
    </div>
  );
}

function PipelineView({ filteredLeads, canEdit, settings, onOpenLead, onSaveLeadChanges, getEstadoLabel }) {
  const [dragOver, setDragOver] = useState(null);
  const cols = [
    { id: "new", label: "Nuevos", color: "var(--c-blue)" },
    { id: "contacted", label: "Contactados", color: "var(--c-amber)" },
    { id: "qualified", label: "Cualificados", color: "var(--c-purple)" },
    { id: "won", label: "Ganados", color: "var(--c-green)" },
    { id: "lost", label: "Perdidos", color: "var(--c-red)" },
  ];
  return (
    <div className="fade-up">
      <div className="section-header mb-4">
        <div className="section-title">Pipeline visual</div>
        <Badge color="blue">{filteredLeads.length} leads</Badge>
      </div>
      <div className="kanban">
        {cols.map(col => {
          const colLeads = filteredLeads.filter(l => (l.status || "new") === col.id);
          const total = colLeads.reduce((s, l) => s + Number(l.valor_estimado || settings?.default_deal_value || 0), 0);
          return (
            <div key={col.id} className={`kanban-col ${dragOver === col.id ? "drag-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
              onDrop={e => { e.preventDefault(); setDragOver(null); if (!canEdit) return; const leadId = e.dataTransfer.getData("leadId"); if (leadId) onSaveLeadChanges(leadId, { status: col.id, ultima_accion: `Estado cambiado a ${col.label}` }); }}
              onDragLeave={() => setDragOver(null)}>
              <div className="kanban-col-header">
                <div>
                  <div className="kanban-col-title" style={{ color: col.color }}>{col.label}</div>
                  <div className="kanban-col-value">{fmtEur(total)}</div>
                </div>
                <Badge color={getEstadoColor(col.id)}>{colLeads.length}</Badge>
              </div>
              {colLeads.slice(0, 8).map(lead => (
                <div key={lead.id} className="kanban-card" draggable={canEdit}
                  onDragStart={e => e.dataTransfer.setData("leadId", lead.id)}
                  onClick={() => onOpenLead(lead)}>
                  <div className="kanban-card-name">{lead.nombre || "Sin nombre"}</div>
                  <div className="kanban-card-need">{lead.necesidad || "—"}</div>
                  <div className="kanban-card-footer">
                    <div className="flex gap-1"><ScoreRing score={lead.score} size={28} /><Badge color={getInteresColor(lead.interes)} style={{ fontSize: 9 }}>{lead.interes || "—"}</Badge></div>
                    <div className="kanban-card-value">{fmtEur(lead.valor_estimado || 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadsTableView({ filteredLeads, selectedLeadIds, setSelectedLeadIds, settings, sendingSms, canEdit, data, onOpenLead, onSaveLeadChanges, onSaveNextBestAction, onExecuteRecommendedAction, onOpenCheckoutForLead, onQuickSms, onOpenLeadWhatsApp, bulkMarkContacted, bulkSendSms, bulkOpenWhatsapp, bulkExecuteAI, filters, setFilters, users, availableCities }) {
  const totalSelectedValue = (data?.leads || []).filter(l => selectedLeadIds.includes(l.id)).reduce((a, l) => a + Number(l.valor_estimado || settings?.default_deal_value || 0), 0);
  const toggle = id => setSelectedLeadIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div className="fade-up">
      {/* Filters */}
      <div className="card mb-4">
        <div className="card-title mb-3">Filtros</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <input placeholder="🔍 Buscar..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="input" />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="select">
            <option value="all">Todos los estados</option>
            {[["new","Nuevo"],["contacted","Contactado"],["qualified","Cualificado"],["won","Ganado"],["lost","Perdido"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filters.owner} onChange={e => setFilters(f => ({ ...f, owner: e.target.value }))} className="select">
            <option value="all">Todos los responsables</option>
            <option value="unassigned">Sin responsable</option>
            {users.map(u => <option key={u.id} value={u.full_name}>{u.full_name}</option>)}
          </select>
          <select value={filters.interes} onChange={e => setFilters(f => ({ ...f, interes: e.target.value }))} className="select">
            <option value="all">Todos los intereses</option>
            <option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option>
          </select>
          <select value={filters.ciudad} onChange={e => setFilters(f => ({ ...f, ciudad: e.target.value }))} className="select">
            <option value="all">Todas las ciudades</option>
            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.producto} onChange={e => setFilters(f => ({ ...f, producto: e.target.value }))} className="select">
            <option value="all">Todos los productos</option>
            <option value="basic">Basic</option><option value="pro">Pro</option><option value="premium">Premium</option>
          </select>
          <select value={filters.minScore} onChange={e => setFilters(f => ({ ...f, minScore: e.target.value }))} className="select">
            <option value="0">Score desde 0</option><option value="50">Score desde 50</option><option value="80">Score desde 80</option>
          </select>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="input" />
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="input" />
        </div>
      </div>

      {/* Bulk actions */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-dim">Seleccionados: <strong>{selectedLeadIds.length}</strong></span>
          <span className="text-sm text-dim">Valor: <strong className="text-green">{fmtEur(totalSelectedValue)}</strong></span>
          <button onClick={bulkMarkContacted} className="btn btn-ghost btn-sm">✓ Contactados</button>
          <button onClick={bulkSendSms} disabled={sendingSms} className="btn btn-ghost btn-sm">{sendingSms ? "Enviando..." : "📱 SMS masivo"}</button>
          <button onClick={bulkOpenWhatsapp} className="btn btn-ghost btn-sm">💬 WhatsApp masivo</button>
          <button onClick={bulkExecuteAI} className="btn btn-ghost btn-sm">🤖 IA masiva</button>
          <button onClick={() => setSelectedLeadIds(filteredLeads.map(l => l.id))} className="btn btn-ghost btn-sm">Seleccionar todos</button>
          <button onClick={() => setSelectedLeadIds([])} className="btn btn-ghost btn-sm">Limpiar</button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sel.</th><th>Fecha</th><th>Nombre</th><th>Teléfono</th><th>Owner</th>
                <th>Score</th><th>Estado</th><th>Interés</th><th>Valor</th><th>Predicción</th>
                <th>Acción</th><th>Prioridad</th><th>Producto IA</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr><td colSpan={14}><div className="empty">Sin leads con esos filtros.</div></td></tr>
              ) : filteredLeads.slice(0, 100).map(lead => (
                <tr key={lead.id}>
                  <td><input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggle(lead.id)} /></td>
                  <td className="text-xs text-muted">{formatDate(lead.created_at)}</td>
                  <td className="bold">{lead.nombre || "—"}<div className="text-xs text-muted">{lead.ciudad}</div></td>
                  <td>{lead.telefono || "—"}</td>
                  <td className="text-dim">{lead.owner || "—"}</td>
                  <td><ScoreRing score={lead.score} size={32} /></td>
                  <td><Badge color={getEstadoColor(lead.status)}>{getEstadoLabel(lead.status)}</Badge></td>
                  <td><Badge color={getInteresColor(lead.interes)}>{lead.interes || "—"}</Badge></td>
                  <td className="text-green text-mono">{fmtEur(lead.valor_estimado)}</td>
                  <td><Badge color="green">{lead.predicted_close_probability || 0}%</Badge></td>
                  <td><Badge color={getNextActionColor(lead.next_action)}>{getNextActionLabel(lead.next_action)}</Badge></td>
                  <td><Badge color={getPriorityColor(lead.next_action_priority)}>{lead.next_action_priority || "—"}</Badge></td>
                  <td><Badge color={getProductTierColor(getRecommendedProductTier(lead))}>{getProductTierLabel(getRecommendedProductTier(lead))}</Badge></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => onOpenLead(lead)} className="btn btn-ghost btn-sm">Ver</button>
                      <a href={lead.telefono ? `tel:${lead.telefono}` : "#"} className="btn btn-ghost btn-sm">📞</a>
                      <button onClick={() => onOpenLeadWhatsApp(lead)} className="btn btn-ghost btn-sm">💬</button>
                      <button onClick={() => onSaveNextBestAction(lead)} className="btn btn-ghost btn-sm">⚡</button>
                      <button onClick={() => onExecuteRecommendedAction(lead)} className="btn btn-ghost btn-sm">▶</button>
                      <button onClick={() => onOpenCheckoutForLead(lead)} className="btn btn-green btn-sm">💳</button>
                      {canEdit && <>
                        <button onClick={() => onQuickSms(lead)} disabled={sendingSms} className="btn btn-ghost btn-sm">📱</button>
                        <button onClick={() => onSaveLeadChanges(lead.id, { status: "contacted", ultima_accion: "Marcado contactado desde tabla" })} className="btn btn-ghost btn-sm">✓</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView({ data, revenue, leadRevenue, ownerRevenue, voiceStats, priorityStats, reactivationStats, upsellStats, appointmentStats, messageExperiments, filteredLeads, settings }) {
  const { metrics = {}, rankings = { bestDays: [], bestHours: [] } } = data;
  return (
    <div className="fade-up">
      {/* Revenue */}
      {revenue && (
        <div className="card mb-4">
          <div className="card-title">💰 Ingresos</div>
          <div className="stat-grid">
            <StatCard title="Total" value={fmtEur(revenue.total)} accent="var(--c-green)" />
            <StatCard title="Hoy" value={fmtEur(revenue.today)} accent="var(--c-blue)" />
            <StatCard title="Semana" value={fmtEur(revenue.week)} accent="var(--c-amber)" />
            <StatCard title="Ticket medio" value={fmtEur(revenue.avgTicket)} accent="var(--c-purple)" />
            <StatCard title="Ventas" value={revenue.count || 0} accent="var(--c-cyan)" />
          </div>
        </div>
      )}

      {/* Scoring dist */}
      <div className="card mb-4">
        <div className="card-title">📊 Distribución de scoring</div>
        <div className="grid-3">
          {[["Score 80–100", filteredLeads.filter(l => Number(l.score||0) >= 80).length, "green"], ["Score 50–79", filteredLeads.filter(l => { const s = Number(l.score||0); return s >= 50 && s < 80; }).length, "amber"], ["Score 0–49", filteredLeads.filter(l => Number(l.score||0) < 50).length, "red"]].map(([k, v, c]) => (
            <div key={k} className="card-sm text-center">
              <div className="text-xs text-muted mb-2">{k}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: `var(--c-${c})`, fontFamily: "var(--font-mono)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Voice + Priority */}
      <div className="grid-2 mb-4">
        {voiceStats && (
          <div className="card">
            <div className="card-title">📞 Estadísticas de voz</div>
            {[["Total llamadas IA", voiceStats.total, "blue"], ["Llamadas útiles", voiceStats.useful, "green"], ["Cierres por voz", voiceStats.closedByVoice, "purple"]].map(([k, v, c]) => (
              <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><Badge color={c}>{v || 0}</Badge></div>
            ))}
          </div>
        )}
        {priorityStats && (
          <div className="card">
            <div className="card-title">⚡ Distribución de prioridad</div>
            {[["Urgente", priorityStats.urgente, "red"], ["Alta", priorityStats.alta, "amber"], ["Media", priorityStats.media, "blue"], ["Baja", priorityStats.baja, "default"]].map(([k, v, c]) => (
              <div key={k} className="pipeline-row">
                <span className="text-sm text-dim flex-1">{k}</span>
                <div style={{ flex: 1, maxWidth: 120 }}><div className="progress-bar"><div className="progress-fill" style={{ width: `${filteredLeads.length ? ((v||0)/filteredLeads.length*100) : 0}%`, background: `var(--c-${c === "default" ? "blue" : c})` }} /></div></div>
                <Badge color={c}>{v || 0}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lead revenue table */}
      {leadRevenue?.topLeads?.length > 0 && (
        <div className="card mb-4">
          <div className="card-title">💳 Leads que generan ingresos <div className="card-title-right"><Badge color="green">{leadRevenue.topLeads.length}</Badge></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lead</th><th>Email</th><th>Producto</th><th>Pagos</th><th>Ingresos</th><th>Último pago</th></tr></thead>
              <tbody>
                {leadRevenue.topLeads.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td className="bold">{row.customer_name || "—"}<div className="text-xs text-muted">{row.phone}</div></td>
                    <td className="text-dim">{row.customer_email || "—"}</td>
                    <td><Badge color={getProductTierColor(row.product_tier)}>{getProductTierLabel(row.product_tier)}</Badge></td>
                    <td>{row.payments_count || 0}</td>
                    <td><Badge color="green">{fmtEur(row.total_revenue)}</Badge></td>
                    <td className="text-xs text-muted">{formatDate(row.last_payment_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Owner revenue table */}
      {ownerRevenue?.ranking?.length > 0 && (
        <div className="card mb-4">
          <div className="card-title">🏆 Ranking por ingresos <div className="card-title-right"><Badge color="purple">{ownerRevenue.ranking.length} responsables</Badge></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Responsable</th><th>Rol</th><th>Ingresos</th><th>Leads pagados</th><th>Ticket medio</th><th>Último pago</th></tr></thead>
              <tbody>
                {ownerRevenue.ranking.map((row, i) => (
                  <tr key={i}>
                    <td className="bold">{row.owner || "—"} {i === 0 && <Badge color="green">Top</Badge>}</td>
                    <td className="text-dim">{row.role || "—"}</td>
                    <td><Badge color="green">{fmtEur(row.revenue)}</Badge></td>
                    <td>{row.paid_leads || 0}</td>
                    <td className="text-mono">{fmtEur(row.avg_ticket)}</td>
                    <td className="text-xs text-muted">{formatDate(row.last_payment_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rankings */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">📅 Mejores días</div>
          {rankings.bestDays.slice(0, 7).map((item, i) => (
            <div key={i} className="pipeline-row">
              <span className="text-sm text-dim flex-1">{item.label}</span>
              <span className="text-mono text-xs text-muted">{item.calls} llamadas</span>
              <Badge color="blue">{item.conversion}%</Badge>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">🕐 Mejores horas</div>
          {rankings.bestHours.slice(0, 8).map((item, i) => (
            <div key={i} className="pipeline-row">
              <span className="text-sm text-dim flex-1">{item.label}</span>
              <span className="text-mono text-xs text-muted">{item.leads} leads</span>
              <Badge color="green">{item.conversion}%</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsView({ notifications, data, onNavigate }) {
  const alerts = data?.alerts || [];

  return (
    <div className="fade-up">
      <div className="section-header mb-4">
        <div className="section-title">Centro de notificaciones</div>
        <Badge color={notifications.length ? "red" : "green"}>{notifications.length}</Badge>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Prioridades de producto</div>
          {notifications.length === 0 ? <div className="empty">No hay alertas operativas ahora mismo.</div> : notifications.map(item => (
            <div key={item.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <Badge color={getSeverityColor(item.severity)}>{item.severity}</Badge>
              </div>
              <div className="text-xs text-dim mb-2">{item.body}</div>
              <div className="flex gap-2">
                <Badge color="default">{item.area || "general"}</Badge>
                <button onClick={() => onNavigate(item.view || "dashboard")} className="btn btn-ghost btn-sm">Abrir módulo</button>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Alertas del sistema</div>
          {alerts.length === 0 ? <div className="empty">Sin alertas guardadas.</div> : alerts.map(alert => (
            <div key={alert.id} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{alert.title || "Alerta"}</div>
                <div className="text-xs text-dim">{alert.message || "—"}</div>
              </div>
              <Badge color={getSeverityColor(alert.severity)}>{alert.severity || "info"}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingView({ workspace, onNavigate }) {
  const checklist = workspace?.checklist || { items: [], completed: 0, total: 0, progress: 0 };
  const integrations = workspace?.integrations || [];
  const nextActions = workspace?.nextActions || [];

  return (
    <div className="fade-up">
      <div className="stat-grid mb-4">
        <StatCard title="Readiness" value={`${workspace?.readinessScore || 0}%`} sub="Estado general de activación" accent="var(--c-blue)" />
        <StatCard title="Checklist" value={`${checklist.completed || 0}/${checklist.total || 0}`} sub="Pasos completados" accent="var(--c-green)" />
        <StatCard title="Integraciones OK" value={integrations.filter(item => item.ready).length} sub="Servicios listos" accent="var(--c-purple)" />
        <StatCard title="Siguiente foco" value={nextActions[0]?.title || "Cuenta lista"} sub="Próxima acción recomendada" accent="var(--c-amber)" />
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Estado de onboarding</div>
          <div className="card-sm mb-3">
            <div className="text-sm font-semibold mb-1">{workspace?.summary || "Sin resumen disponible"}</div>
            <div className="progress-bar mt-3"><div className="progress-fill" style={{ width: `${checklist.progress || 0}%`, background: "var(--c-blue)" }} /></div>
          </div>
          {checklist.items.map(item => (
            <div key={item.id} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-xs text-dim">{item.detail}</div>
              </div>
              <div className="flex gap-2">
                <Badge color={item.done ? "green" : "amber"}>{item.done ? "Hecho" : "Pendiente"}</Badge>
                {!item.done && <button onClick={() => onNavigate(item.view || "settings")} className="btn btn-ghost btn-sm">Abrir</button>}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Integraciones y activos</div>
          {integrations.map(item => (
            <div key={item.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{item.name}</div>
                <Badge color={item.ready ? "green" : "amber"}>{item.ready ? "Listo" : "Falta"}</Badge>
              </div>
              <div className="text-xs text-dim mb-2">{item.detail}</div>
              {!item.ready && <button onClick={() => onNavigate(item.view || "settings")} className="btn btn-ghost btn-sm">Completar</button>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Siguientes acciones</div>
        {nextActions.length === 0 ? <div className="empty">La cuenta ya tiene la base bastante cerrada.</div> : nextActions.map(action => (
          <div key={action.id} className="pipeline-row">
            <div className="flex-1">
              <div className="text-sm font-semibold">{action.title}</div>
              <div className="text-xs text-dim">{action.detail}</div>
            </div>
            <button onClick={() => onNavigate(action.view || "settings")} className="btn btn-primary btn-sm">Ir</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxView({ inboxData, leads, onOpenLead }) {
  const threads = inboxData?.threads || [];
  const leadMap = new Map((leads || []).map(lead => [lead.id, lead]));

  return (
    <div className="fade-up">
      <div className="stat-grid mb-4">
        <StatCard title="Hilos" value={inboxData?.summary?.totalThreads || 0} sub="Conversaciones activas" accent="var(--c-blue)" />
        <StatCard title="Atención" value={inboxData?.summary?.requiresAttention || 0} sub="Hilos con prioridad" accent="var(--c-red)" />
        <StatCard title="Sin respuesta" value={inboxData?.summary?.waitingForReply || 0} sub="Pendientes de salida" accent="var(--c-amber)" />
        <StatCard title="Con llamadas" value={inboxData?.summary?.withCalls || 0} sub="Hilos con voz" accent="var(--c-purple)" />
      </div>

      <div className="card">
        <div className="card-title">Inbox multicanal</div>
        {threads.length === 0 ? <div className="empty">Todavía no hay conversaciones trazadas para este cliente.</div> : threads.map(thread => (
          <div key={thread.id} className="card-sm mb-2">
            <div className="flex justify-between mb-2" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
                  <div className="text-sm font-semibold">{thread.leadName}</div>
                  <Badge color={getEstadoColor(thread.status)}>{getEstadoLabel(thread.status)}</Badge>
                  <Badge color={getChannelColor(thread.lastChannel)}>{getChannelLabel(thread.lastChannel)}</Badge>
                  {thread.hasRecording && <Badge color="purple">Grabación</Badge>}
                  {thread.hasPayment && <Badge color="green">Pago</Badge>}
                  {thread.waitingForReply && <Badge color="amber">Esperando salida</Badge>}
                </div>
                <div className="text-xs text-dim mb-2">{thread.phone || "Sin teléfono"} · {thread.owner || "Sin owner"} · {formatDate(thread.lastActivityAt)}</div>
                <div className="text-sm text-dim">{truncateText(thread.lastPreview, 180)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge color={getPriorityColor(thread.next_action_priority)}>{thread.next_action_priority || "media"}</Badge>
                <div className="text-mono text-xs text-muted">Score {thread.score || 0}</div>
                <button onClick={() => { const lead = leadMap.get(thread.leadId); if (lead) onOpenLead(lead); }} className="btn btn-primary btn-sm">Abrir lead</button>
              </div>
            </div>
            <div className="grid-3 mb-2">
              <div className="card-sm"><div className="text-xs text-muted mb-1">Mensajes</div><div className="text-sm font-semibold">{thread.messageCount || 0}</div></div>
              <div className="card-sm"><div className="text-xs text-muted mb-1">Llamadas</div><div className="text-sm font-semibold">{thread.callCount || 0}</div></div>
              <div className="card-sm"><div className="text-xs text-muted mb-1">Valor</div><div className="text-sm font-semibold">{fmtEur(thread.valor_estimado || 0)}</div></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {thread.items.slice(0, 3).map(item => (
                <Badge key={item.id} color={getChannelColor(item.channel)}>
                  {getChannelLabel(item.channel)} · {truncateText(item.preview, 42)}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceCenterView({ voiceCenterData, leads, onOpenLead }) {
  const calls = voiceCenterData?.calls || [];
  const leadMap = new Map((leads || []).map(lead => [lead.id, lead]));

  return (
    <div className="fade-up">
      <div className="stat-grid mb-4">
        <StatCard title="Llamadas" value={voiceCenterData?.summary?.total || 0} sub="Total analizadas" accent="var(--c-blue)" />
        <StatCard title="Grabadas" value={voiceCenterData?.summary?.withRecording || 0} sub="Con audio disponible" accent="var(--c-purple)" />
        <StatCard title="Score medio" value={voiceCenterData?.summary?.avgScore || 0} sub="QA agregada" accent="var(--c-green)" />
        <StatCard title="Duración media" value={formatSeconds(voiceCenterData?.summary?.avgDuration || 0)} sub="Media por llamada" accent="var(--c-amber)" />
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Problemas más repetidos</div>
          {(voiceCenterData?.commonIssues || []).length === 0 ? <div className="empty">Todavía no hay suficientes llamadas para detectar patrones.</div> : voiceCenterData.commonIssues.map(issue => (
            <div key={issue.label} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{issue.label}</div>
                <div className="text-xs text-dim">Aparece en varias llamadas recientes.</div>
              </div>
              <Badge color="red">{issue.count}</Badge>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Resumen del centro de voz</div>
          {[
            ["Leads capturados", voiceCenterData?.summary?.capturedLeads || 0],
            ["Con grabación", voiceCenterData?.summary?.withRecording || 0],
            ["Top performers", calls.filter(item => (item.qa?.overall || 0) >= 75).length],
            ["A revisar", calls.filter(item => (item.qa?.overall || 0) < 55).length],
          ].map(([label, value]) => (
            <div key={label} className="pipeline-row">
              <span className="text-sm text-dim flex-1">{label}</span>
              <Badge color="blue">{value}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Grabaciones y QA</div>
        {calls.length === 0 ? <div className="empty">Aún no hay llamadas en el centro de voz.</div> : calls.map(call => (
          <div key={call.id} className="card-sm mb-3">
            <div className="flex justify-between mb-2" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
                  <div className="text-sm font-semibold">{call.leadName}</div>
                  <Badge color={call.qa?.overall >= 75 ? "green" : call.qa?.overall >= 55 ? "amber" : "red"}>{call.qa?.overall || 0}/100</Badge>
                  <Badge color="blue">{call.status || "unknown"}</Badge>
                </div>
                <div className="text-xs text-dim">{call.phone || "Sin teléfono"} · {formatDate(call.created_at)} · {formatSeconds(call.duration_seconds)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <Badge color="blue">Calidad {call.qa?.quality || 0}</Badge>
                  <Badge color="purple">Empatía {call.qa?.empathy || 0}</Badge>
                  <Badge color="green">Cierre {call.qa?.closing || 0}</Badge>
                </div>
                {call.leadId && leadMap.get(call.leadId) && <button onClick={() => onOpenLead(leadMap.get(call.leadId))} className="btn btn-ghost btn-sm">Abrir lead</button>}
              </div>
            </div>
            <div className="text-sm text-dim mb-2">{call.summary || "Sin resumen."}</div>
            {call.recording_url ? (
              <div className="card-sm mb-2">
                <div className="text-xs text-muted mb-2">Grabación</div>
                <audio controls style={{ width: "100%" }}>
                  <source src={call.recording_url} />
                </audio>
              </div>
            ) : (
              <div className="text-xs text-dim mb-2">Sin grabación disponible para esta llamada.</div>
            )}
            {call.transcript && (
              <div className="card-sm mb-2">
                <div className="text-xs text-muted mb-2">Transcripción</div>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, maxHeight: 180, overflow: "auto" }}>{truncateText(call.transcript, 1200)}</pre>
              </div>
            )}
            <div className="text-xs text-dim">Mejora sugerida: {call.qa?.recommendation || "Mantener la línea actual."}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoiView({ roiSnapshot, leadRevenue, ownerRevenue, openCheckout, openBillingPortal, billingLoading }) {
  const summary = roiSnapshot?.summary || {};
  const topLeads = leadRevenue?.topLeads || [];
  const ownerRanking = ownerRevenue?.ranking || [];

  return (
    <div className="fade-up">
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => openCheckout("pro")} disabled={billingLoading} className="btn btn-primary">{billingLoading ? "Abriendo..." : "Optimizar plan"}</button>
        <button onClick={openBillingPortal} disabled={billingLoading} className="btn btn-ghost">💳 Ver billing</button>
      </div>

      <div className="stat-grid mb-4">
        <StatCard title="Ingresos" value={fmtEur(summary.totalRevenue || 0)} sub="Valor ya capturado" accent="var(--c-green)" />
        <StatCard title="Pipeline" value={fmtEur(summary.pipelineValue || 0)} sub="Valor potencial activo" accent="var(--c-blue)" />
        <StatCard title="ROI estimado" value={summary.roiMultiple ? `x${summary.roiMultiple}` : "—"} sub="Frente a la última inversión trazada" accent="var(--c-purple)" />
        <StatCard title="Win rate" value={`${summary.winRate || 0}%`} sub="Ganados sobre leads" accent="var(--c-amber)" />
        <StatCard title="Ingreso/lead" value={fmtEur(summary.revenuePerLead || 0)} sub="Eficiencia por oportunidad" accent="var(--c-cyan)" />
        <StatCard title="Meta mensual" value={fmtEur(summary.targetRevenue || 0)} sub="Objetivo configurado" accent="var(--c-blue)" />
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Historia de valor</div>
          {(roiSnapshot?.story || []).map(item => (
            <div key={item.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <Badge color="green">{fmtEur(item.value || 0)}</Badge>
              </div>
              <div className="text-xs text-dim">{item.detail}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Lectura ejecutiva</div>
          {(roiSnapshot?.focusAreas || []).map(item => (
            <div key={item.id} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-xs text-dim">{item.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Leads con más ingreso</div>
          {topLeads.length === 0 ? <div className="empty">Sin ingresos trazados todavía.</div> : topLeads.slice(0, 8).map((row, index) => (
            <div key={`${row.phone}:${index}`} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{row.customer_name || "Lead"}</div>
                <div className="text-xs text-dim">{row.customer_email || row.phone || "Sin contacto"}</div>
              </div>
              <Badge color="green">{fmtEur(row.total_revenue || 0)}</Badge>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Ranking del equipo</div>
          {ownerRanking.length === 0 ? <div className="empty">Todavía no hay ranking por responsables.</div> : ownerRanking.slice(0, 8).map((row, index) => (
            <div key={`${row.owner}:${index}`} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{row.owner || "Equipo"}</div>
                <div className="text-xs text-dim">{row.paid_leads || 0} leads pagados · ticket medio {fmtEur(row.avg_ticket || 0)}</div>
              </div>
              <Badge color={index === 0 ? "green" : "blue"}>{fmtEur(row.revenue || 0)}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StrategyView({ strategyData, onNavigate }) {
  const summaryCards = strategyData?.summaryCards || [];
  const benchmarkCards = strategyData?.benchmarkCards || [];
  const insights = strategyData?.insights || [];
  const products = strategyData?.productFocus || [];
  const owners = strategyData?.ownerFocus || [];
  const benchmarkHistory = strategyData?.benchmarkHistory || [];

  const renderValue = (card) =>
    card?.suffix === "EUR" ? fmtEur(card?.value || 0) : String(card?.value ?? "—");

  return (
    <div className="fade-up">
      <div className="section-header mb-4">
        <div>
          <div className="section-title">Strategy room</div>
          <div className="text-sm text-dim">{strategyData?.story || "Sin lectura estratégica todavía."}</div>
        </div>
        <Badge color="purple">{insights.length} insights</Badge>
      </div>

      <div className="stat-grid mb-4">
        {summaryCards.map((card) => (
          <StatCard
            key={card.id}
            title={card.label}
            value={renderValue(card)}
            sub={card.detail}
            accent="var(--c-blue)"
          />
        ))}
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Benchmarks operativos</div>
          {benchmarkCards.length === 0 ? (
            <div className="empty">Sin benchmarks disponibles.</div>
          ) : (
            benchmarkCards.map((item) => (
              <div key={item.id} className="card-sm mb-2">
                <div className="flex justify-between mb-1">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <Badge color={getSeverityColor(item.status)}>{getHealthLabel(item.status)}</Badge>
                </div>
                <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
                  <Badge color="blue">{String(item.value)}</Badge>
                  {item.target && <Badge color="default">Objetivo {String(item.target)}</Badge>}
                  <Badge color={Number(item.delta) >= 0 ? "green" : "amber"}>
                    {Number(item.delta) > 0 ? "+" : ""}
                    {String(item.delta)}
                  </Badge>
                </div>
                <div className="text-xs text-dim">{item.detail}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-title">Movimientos recomendados</div>
          {insights.length === 0 ? (
            <div className="empty">Todavía no hay recomendaciones priorizadas.</div>
          ) : (
            insights.slice(0, 6).map((item) => (
              <div key={item.id} className="card-sm mb-2">
                <div className="flex justify-between mb-1">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <Badge color="purple">{item.priority || 0}</Badge>
                </div>
                <div className="text-xs text-dim mb-2">{item.body}</div>
                <div className="flex gap-2">
                  <Badge color="default">{item.category || "general"}</Badge>
                  {item.view && (
                    <button onClick={() => onNavigate(item.view)} className="btn btn-ghost btn-sm">
                      Abrir módulo
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Foco por producto</div>
          {products.length === 0 ? (
            <div className="empty">Todavía no hay señal suficiente por producto.</div>
          ) : (
            products.map((product) => (
              <div key={product.key || product.tier} className="pipeline-row">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{product.name}</div>
                  <div className="text-xs text-dim">
                    {product.sales || 0} ventas · ticket medio {fmtEur(product.avgTicket || 0)}
                  </div>
                </div>
                <Badge color="green">{fmtEur(product.revenue || 0)}</Badge>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-title">Momentum del equipo</div>
          {owners.length === 0 ? (
            <div className="empty">Todavía no hay ranking operativo.</div>
          ) : (
            owners.map((owner, index) => (
              <div key={`${owner.owner}:${index}`} className="pipeline-row">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{owner.owner || "Equipo"}</div>
                  <div className="text-xs text-dim">
                    {owner.role || "—"} · {owner.payments_count || 0} pagos
                  </div>
                </div>
                <Badge color={index === 0 ? "green" : "blue"}>{fmtEur(owner.revenue || 0)}</Badge>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Histórico de benchmarks</div>
        {benchmarkHistory.length === 0 ? (
          <div className="empty">No hay snapshots históricos todavía.</div>
        ) : (
          benchmarkHistory.map((item) => (
            <div key={item.id} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs text-dim">{item.detail || "Snapshot estratégico guardado."}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{String(item.value)}</div>
                <div className="text-xs text-muted">{formatDate(item.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ExperimentsView({ experiments, experimentsMeta }) {
  const summary = experimentsMeta?.summary || {};
  const channelBreakdown = experimentsMeta?.channelBreakdown || [];
  const stageBreakdown = experimentsMeta?.stageBreakdown || [];
  const suggestions = experimentsMeta?.suggestions || [];
  const winner = summary?.winner || null;

  return (
    <div className="fade-up">
      <div className="section-header mb-4">
        <div>
          <div className="section-title">Experiment lab</div>
          <div className="text-sm text-dim">A/B testing y aprendizaje comercial con señal real del cliente.</div>
        </div>
        <Badge color="blue">{summary?.activeVariants || 0} variantes vivas</Badge>
      </div>

      <div className="stat-grid mb-4">
        <StatCard title="Variantes" value={summary?.totalVariants || 0} sub="Activas en librería" accent="var(--c-blue)" />
        <StatCard title="Enviados" value={summary?.totalSent || 0} sub="Volumen total medido" accent="var(--c-purple)" />
        <StatCard title="Replies" value={summary?.totalReplies || 0} sub={`${summary?.replyRate || 0}% de reply rate`} accent="var(--c-green)" />
        <StatCard title="Conversión" value={summary?.totalConverted || 0} sub={`${summary?.conversionRate || 0}% de conversión`} accent="var(--c-amber)" />
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Ganador actual</div>
          {!winner ? (
            <div className="empty">Aún no hay una variante ganadora con señal suficiente.</div>
          ) : (
            <div className="card-sm">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{winner.name}</div>
                <Badge color={winner.confidence === "high" ? "green" : winner.confidence === "medium" ? "amber" : "blue"}>
                  {winner.confidence || "low"}
                </Badge>
              </div>
              <div className="text-xs text-dim mb-2">{winner.channel} · {winner.stage}</div>
              <div className="text-sm text-dim mb-2">{winner.content}</div>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                <Badge color="blue">{winner.sent || 0} enviados</Badge>
                <Badge color="green">{winner.reply_rate || 0}% reply</Badge>
                <Badge color="purple">{winner.conversion_rate || 0}% conv.</Badge>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Siguientes tests</div>
          {suggestions.length === 0 ? (
            <div className="empty">No hay sugerencias de test por ahora.</div>
          ) : (
            suggestions.map((item) => (
              <div key={item.id} className="card-sm mb-2">
                <div className="text-sm font-semibold mb-1">{item.title}</div>
                <div className="text-xs text-dim">{item.body}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Rendimiento por canal</div>
          {channelBreakdown.length === 0 ? (
            <div className="empty">Sin datos por canal todavía.</div>
          ) : (
            channelBreakdown.map((item) => (
              <div key={item.channel} className="pipeline-row">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{item.channel}</div>
                  <div className="text-xs text-dim">{item.variants} variantes activas</div>
                </div>
                <Badge color="green">{item.reply_rate || 0}% reply</Badge>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-title">Rendimiento por etapa</div>
          {stageBreakdown.length === 0 ? (
            <div className="empty">Sin etapas medidas todavía.</div>
          ) : (
            stageBreakdown.map((item) => (
              <div key={item.stage} className="pipeline-row">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{item.stage}</div>
                  <div className="text-xs text-dim">{item.sent || 0} envíos</div>
                </div>
                <Badge color="purple">{item.conversion_rate || 0}% conv.</Badge>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Variantes activas</div>
        {experiments.length === 0 ? (
          <div className="empty">Todavía no hay variantes activas.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Variante</th>
                  <th>Canal</th>
                  <th>Etapa</th>
                  <th>Enviados</th>
                  <th>Reply</th>
                  <th>Conversión</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((variant) => (
                  <tr key={variant.id}>
                    <td className="bold">
                      {variant.name}
                      <div className="text-xs text-muted">{truncateText(variant.content, 90)}</div>
                    </td>
                    <td><Badge color="default">{variant.channel}</Badge></td>
                    <td><Badge color="blue">{variant.stage}</Badge></td>
                    <td>{variant.sent || 0}</td>
                    <td><Badge color="green">{variant.reply_rate || 0}%</Badge></td>
                    <td><Badge color="purple">{variant.conversion_rate || 0}%</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandLabView({
  brandLabData,
  brandingForm,
  setBrandingForm,
  saveBranding,
  portalSettingsForm,
  setPortalSettingsForm,
  savePortalSettings,
  portalSettingsSaving,
  canAdmin,
  connectCustomDomain,
  domainLoading,
}) {
  const preview = brandLabData?.preview || {};
  const livePreview = {
    ...preview,
    brandName: brandingForm?.brand_name || preview.brandName || "Nesped",
    logoText:
      brandingForm?.logo_text ||
      preview.logoText ||
      (brandingForm?.brand_name || preview.brandName || "N").slice(0, 1).toUpperCase(),
    logoUrl: brandingForm?.brand_logo_url || preview.logoUrl || "",
    primaryColor: brandingForm?.primary_color || preview.primaryColor || "#ffffff",
    secondaryColor: brandingForm?.secondary_color || preview.secondaryColor || "#030303",
    tagline: portalSettingsForm?.tagline || preview.tagline || "Revenue OS premium",
    customDomain: brandingForm?.custom_domain || preview.customDomain || "",
    theme: {
      accent: brandingForm?.accent || preview.theme?.accent || BRAND_THEME_PRESETS[0].accent,
      accentText:
        brandingForm?.accent_text ||
        preview.theme?.accentText ||
        BRAND_THEME_PRESETS[0].accent_text,
      button:
        brandingForm?.button || preview.theme?.button || BRAND_THEME_PRESETS[0].button,
      badge:
        brandingForm?.badge || preview.theme?.badge || BRAND_THEME_PRESETS[0].badge,
    },
  };

  const integrations = brandLabData?.integrations || [];
  const catalog = brandLabData?.catalog || [];
  const suggestions = brandLabData?.suggestions || [];
  const themePresetId = getBrandThemePresetId(brandingForm);

  return (
    <div className="fade-up">
      <div className="section-header mb-4">
        <div>
          <div className="section-title">Brand Lab</div>
          <div className="text-sm text-dim">White-label, integraciones y presencia premium del cliente final.</div>
        </div>
        <Badge color={brandLabData?.readinessState === "ready" ? "green" : brandLabData?.readinessState === "progress" ? "amber" : "blue"}>
          {brandLabData?.readinessScore || 0}% listo
        </Badge>
      </div>

      <div className="grid-2 mb-4">
        <div
          className="card"
          style={{
            background: `linear-gradient(135deg, ${livePreview.secondaryColor}, rgba(5,7,10,0.98))`,
            borderColor: `${livePreview.primaryColor}30`,
          }}
        >
          <div className="card-title">Vista previa pública</div>
          <div className="card-sm mb-3" style={{ borderColor: `${livePreview.primaryColor}25` }}>
            <div className="flex items-center justify-between mb-4" style={{ gap: 12 }}>
              <div className="flex items-center gap-3">
                {livePreview.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={livePreview.logoUrl} alt={livePreview.brandName} style={{ width: 44, height: 44, borderRadius: 14, objectFit: "cover" }} />
                ) : (
                  <div className="sidebar-logo-icon" style={{ width: 44, height: 44, borderRadius: 14 }}>
                    {livePreview.logoText}
                  </div>
                )}
                <div>
                  <div className="text-sm font-semibold">{livePreview.brandName}</div>
                  <div className="text-xs text-dim">{livePreview.customDomain || livePreview.previewUrl || "White-label preview"}</div>
                </div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs ${livePreview.theme.badge}`}>Activo</div>
            </div>
            <div className={`mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 ${livePreview.theme.accent} px-4 py-2 text-xs uppercase tracking-[0.22em] ${livePreview.theme.accentText}`}>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Atención con IA premium
            </div>
            <div style={{ fontSize: 32, lineHeight: 1.05, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 12 }}>
              {livePreview.brandName}
            </div>
            <div className="text-sm text-dim mb-4">{livePreview.tagline}</div>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              <button className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${livePreview.theme.button}`}>Probar demo</button>
              <button className="btn btn-ghost btn-sm">Acceso clientes</button>
            </div>
          </div>
          <div className="grid-2">
            <div className="card-sm">
              <div className="text-xs text-muted mb-2">Preview</div>
              <div className="text-sm font-semibold">{livePreview.previewUrl || "—"}</div>
            </div>
            <div className="card-sm">
              <div className="text-xs text-muted mb-2">Login</div>
              <div className="text-sm font-semibold">{preview.loginUrl || "/login"}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Siguientes mejoras de marca</div>
          {suggestions.length === 0 ? (
            <div className="empty">La base de white-label ya está bastante cerrada.</div>
          ) : (
            suggestions.map((item) => (
              <div key={item.id} className="card-sm mb-2">
                <div className="text-sm font-semibold mb-1">{item.title}</div>
                <div className="text-xs text-dim">{item.body}</div>
              </div>
            ))
          )}
          <div className="divider" />
          <div className="text-xs text-muted mb-2 text-upper">Integraciones activas</div>
          {integrations.map((integration) => (
            <div key={integration.id} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{integration.name}</div>
                <div className="text-xs text-dim">{integration.detail}</div>
              </div>
              <Badge color={integration.ready ? "green" : "amber"}>{integration.ready ? "listo" : "pendiente"}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">White-label y tema</div>
          <div className="flex-col gap-3" style={{ display: "flex" }}>
            {[["Nombre de marca", "brand_name", "text"], ["Logo text / iniciales", "logo_text", "text"], ["URL del logo", "brand_logo_url", "text"], ["Color principal", "primary_color", "text"], ["Color secundario", "secondary_color", "text"], ["Dominio propio", "custom_domain", "text"]].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1" style={{ display: "block" }}>{label}</label>
                <input type={type} disabled={!canAdmin} value={brandingForm?.[key] || ""} onChange={e => setBrandingForm(f => ({ ...(f || {}), [key]: e.target.value }))} className="input" />
              </div>
            ))}
            <div>
              <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Preset visual</label>
              <select
                disabled={!canAdmin}
                value={themePresetId}
                className="select"
                onChange={(e) => {
                  if (e.target.value === "custom") return;
                  setBrandingForm((current) => applyBrandThemePreset(current, e.target.value));
                }}
              >
                {BRAND_THEME_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            {canAdmin && (
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                <button onClick={saveBranding} className="btn btn-primary">Guardar branding</button>
                <button onClick={connectCustomDomain} disabled={domainLoading || !brandingForm?.custom_domain} className="btn btn-ghost">
                  {domainLoading ? "Conectando..." : "Conectar dominio"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Canales e integraciones</div>
          <div className="flex-col gap-3" style={{ display: "flex" }}>
            {[["Tagline", "tagline", "text"], ["Número Twilio", "twilio_number", "text"], ["Webhook", "webhook", "text"], ["Email informe diario", "daily_report_email", "email"], ["Email informe semanal", "weekly_report_email", "email"]].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1" style={{ display: "block" }}>{label}</label>
                <input type={type} disabled={!canAdmin} value={portalSettingsForm?.[key] ?? ""} onChange={e => setPortalSettingsForm(f => ({ ...(f || {}), [key]: e.target.value }))} className="input" />
              </div>
            ))}
            {canAdmin && (
              <button onClick={savePortalSettings} disabled={portalSettingsSaving} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                {portalSettingsSaving ? "Guardando..." : "Guardar canales"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Catálogo activo</div>
        {catalog.length === 0 ? (
          <div className="empty">No hay productos activos cargados.</div>
        ) : (
          <div className="grid-3">
            {catalog.map((product) => (
              <div key={product.id} className="card-sm">
                <div className="flex justify-between mb-2">
                  <div className="text-sm font-semibold">{product.name}</div>
                  <Badge color={product.active ? "green" : "amber"}>{product.tier}</Badge>
                </div>
                <div className="text-xs text-dim mb-3">{product.description || "Sin descripción todavía."}</div>
                <div className="text-lg font-semibold mb-3">{fmtEur(product.price || 0)}</div>
                <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                  {(product.features || []).map((feature) => (
                    <Badge key={feature} color="default">{feature}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BillingView({ data, billingData, revenue, usagePressure, openCheckout, openBillingPortal, billingLoading }) {
  const client = data?.client || {};
  const activeSubscription = billingData?.activeSubscription || null;
  const invoices = billingData?.invoices || [];

  return (
    <div className="fade-up">
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => openCheckout(client.plan || "pro")} disabled={billingLoading} className="btn btn-primary">
          {billingLoading ? "Abriendo..." : "⬆ Gestionar o ampliar plan"}
        </button>
        <button onClick={openBillingPortal} disabled={billingLoading} className="btn btn-ghost">💳 Abrir facturación</button>
      </div>

      <div className="stat-grid mb-4">
        <StatCard title="Plan actual" value={client.plan || "pro"} sub="Configurado en cliente" accent="var(--c-blue)" />
        <StatCard title="Estado suscripción" value={activeSubscription?.status || "sin suscripción"} sub="Stripe / billing" accent="var(--c-green)" />
        <StatCard title="Ingresos generados" value={fmtEur(revenue?.total || billingData?.totalRevenue || 0)} sub="Valor total trazado" accent="var(--c-purple)" />
        <StatCard title="Uso de llamadas" value={usagePressure?.callsLimit ? `${usagePressure.usagePercent}%` : usagePressure?.totalCalls || 0} sub={usagePressure?.callsLimit ? `${usagePressure.totalCalls}/${usagePressure.callsLimit}` : "Sin límite definido"} accent="var(--c-amber)" />
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Estado de facturación</div>
          <div className="card-sm mb-3">
            <div className="text-sm font-semibold mb-1">{activeSubscription ? "Suscripción gestionada" : "Cuenta todavía no consolidada"}</div>
            <div className="text-xs text-dim">{usagePressure?.recommendation || "Sin recomendación disponible"}</div>
          </div>
          <div className="mb-3">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, usagePressure?.usagePercent || 0)}%`, background: usagePressure?.level === "critical" ? "var(--c-red)" : usagePressure?.level === "high" ? "var(--c-amber)" : "var(--c-green)" }} /></div>
          </div>
          {[["Customer Stripe", client.stripe_customer_id || "No vinculado"], ["Facturas pagadas", billingData?.paidInvoicesCount || 0], ["Facturas pendientes", billingData?.pendingInvoicesCount || 0], ["Leads pagados", billingData?.paidLeads || 0]].map(([k, v]) => (
            <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><span className="text-sm font-semibold">{String(v)}</span></div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">ROI y retorno</div>
          {[["Ingresos históricos", fmtEur(billingData?.totalRevenue || revenue?.total || 0)], ["Pagos trazados", billingData?.totalPayments || 0], ["Última factura", billingData?.lastInvoice ? fmtEur(billingData.lastInvoice.amount) : "—"], ["Próximo foco", usagePressure?.level === "healthy" ? "Expandir canal" : "Ampliar plan"]].map(([k, v]) => (
            <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><span className="text-sm font-semibold">{String(v)}</span></div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Facturas recientes</div>
          {invoices.length === 0 ? <div className="empty">Aún no hay facturas sincronizadas.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Factura</th><th>Estado</th><th>Importe</th><th>Fecha</th></tr></thead>
                <tbody>
                  {invoices.slice(0, 10).map(invoice => (
                    <tr key={invoice.id}>
                      <td className="bold">{invoice.stripe_invoice_id || invoice.id}</td>
                      <td><Badge color={invoice.status === "paid" ? "green" : "amber"}>{invoice.status || "unknown"}</Badge></td>
                      <td>{fmtEur(invoice.amount || 0)}</td>
                      <td className="text-xs text-muted">{formatDate(invoice.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Leads con ingreso</div>
          {(billingData?.topLeads || []).length === 0 ? <div className="empty">Sin ventas trazadas todavía.</div> : billingData.topLeads.slice(0, 8).map((lead, index) => (
            <div key={`${lead.phone}:${index}`} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{lead.customer_name || "Cliente"}</div>
                <Badge color="green">{fmtEur(lead.total_revenue || 0)}</Badge>
              </div>
              <div className="text-xs text-dim">{lead.customer_email || lead.phone || "Sin contacto"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlaybooksView({ data, playbookData, playbookForm, setPlaybookForm, savePlaybook, playbookSaving, canEdit }) {
  const client = data?.client || {};
  const library = playbookData?.library || [];

  return (
    <div className="fade-up">
      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Biblioteca de playbooks</div>
          {library.length === 0 ? <div className="empty">Sin playbooks cargados.</div> : library.map(item => (
            <div key={item.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="flex gap-2">
                  <Badge color="default">{item.channel}</Badge>
                  <Badge color="blue">{item.stage}</Badge>
                </div>
              </div>
              <div className="text-xs text-dim mb-2">{item.description}</div>
              <div className="text-sm text-dim">{item.content}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Entrenamiento de la IA</div>
          <div className="grid-2" style={{ gap: 10 }}>
            {[["Tono", "tone"], ["Apertura", "opening"], ["Cualificación", "qualification"], ["Objeciones", "objections"], ["Cierre", "closing"], ["Follow-up", "followup"], ["Upsell", "upsell"], ["Handoff", "handoff"]].map(([label, key]) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1" style={{ display: "block" }}>{label}</label>
                <textarea disabled={!canEdit} rows={3} className="textarea" value={playbookForm?.[key] || ""} onChange={e => setPlaybookForm(p => ({ ...(p || {}), [key]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1" style={{ display: "block" }}>Notas extra</label>
              <textarea disabled={!canEdit} rows={4} className="textarea" value={playbookForm?.notes || ""} onChange={e => setPlaybookForm(p => ({ ...(p || {}), notes: e.target.value }))} />
            </div>
          </div>
          <div className="card-sm mt-3">
            <div className="text-xs text-muted mb-2">Prompt activo para {client.brand_name || client.name || "la marca"}</div>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, maxHeight: 240, overflow: "auto" }}>{playbookForm?.compiledPrompt || playbookData?.workspace?.compiledPrompt || "Sin prompt compilado todavía."}</pre>
          </div>
          {canEdit && <button onClick={savePlaybook} disabled={playbookSaving} className="btn btn-primary mt-3">{playbookSaving ? "Guardando..." : "Guardar playbook"}</button>}
        </div>
      </div>
    </div>
  );
}

function OperationsView({ data, healthData, voiceQaData, runNightly }) {
  const auditLogs = data?.auditLogs || [];
  const services = healthData?.services || {};
  const voiceCalls = voiceQaData?.calls || [];

  return (
    <div className="fade-up">
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={runNightly} className="btn btn-primary">🌙 Ejecutar proceso nocturno</button>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Salud del sistema</div>
          <div className="card-sm mb-3">
            <div className="flex justify-between mb-1">
              <div className="text-sm font-semibold">Resumen</div>
              <Badge color={getSeverityColor(healthData?.summary?.level)}>{getHealthLabel(healthData?.summary?.level)}</Badge>
            </div>
            <div className="text-xs text-dim">{healthData?.summary?.message || "Sin diagnóstico."}</div>
          </div>
          {Object.entries(services).map(([key, service]) => (
            <div key={key} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{key}</div>
                <div className="text-xs text-dim">{service.detail}</div>
              </div>
              <Badge color={getSeverityColor(service.level)}>{getHealthLabel(service.level)}</Badge>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">QA de llamadas IA</div>
          <div className="stat-grid mb-3">
            <StatCard title="Llamadas revisadas" value={voiceQaData?.summary?.total || 0} accent="var(--c-blue)" />
            <StatCard title="Score medio" value={voiceQaData?.summary?.avgScore || 0} accent="var(--c-green)" />
            <StatCard title="Top calls" value={voiceQaData?.summary?.bestCalls || 0} accent="var(--c-purple)" />
            <StatCard title="A revisar" value={voiceQaData?.summary?.needsAttention || 0} accent="var(--c-red)" />
          </div>
          {voiceCalls.length === 0 ? <div className="empty">Todavía no hay llamadas IA evaluables.</div> : voiceCalls.slice(0, 6).map(call => (
            <div key={call.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1">
                <div className="text-sm font-semibold">{call.leadName}</div>
                <Badge color={call.qa.overall >= 75 ? "green" : call.qa.overall >= 55 ? "amber" : "red"}>{call.qa.overall}/100</Badge>
              </div>
              <div className="text-xs text-dim mb-2">{call.summary || "Sin resumen."}</div>
              <div className="flex flex-wrap gap-2">
                <Badge color="blue">Calidad {call.qa.quality}</Badge>
                <Badge color="purple">Empatía {call.qa.empathy}</Badge>
                <Badge color="green">Cierre {call.qa.closing}</Badge>
              </div>
              <div className="text-xs text-dim mt-2">Mejora sugerida: {call.qa.recommendation}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Audit log visible</div>
        {auditLogs.length === 0 ? <div className="empty">Sin actividad registrada.</div> : auditLogs.slice(0, 20).map(log => (
          <div key={log.id} className="pipeline-row">
            <div className="flex-1">
              <div className="text-sm font-semibold">{log.action}</div>
              <div className="text-xs text-dim">{log.entity_type} · {log.entity_id || "—"} · {log.actor || "sistema"}</div>
            </div>
            <div className="text-xs text-muted">{formatDate(log.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutomationsView({ leads, runColdLeadReactivation, recalculateDynamicScoring, runAutomaticFunnel, runAutomaticOnboarding, runVoiceCalls, recalculatePriority, runUpsells, runAppointments }) {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});

  const run = async (id, fn) => {
    setRunning(p => ({ ...p, [id]: true }));
    setResults(p => ({ ...p, [id]: null }));
    try {
      const res = await fn();
      setResults(p => ({ ...p, [id]: { ok: true, msg: res } }));
    } catch (e) {
      setResults(p => ({ ...p, [id]: { ok: false, msg: e.message } }));
    }
    setRunning(p => ({ ...p, [id]: false }));
  };

  const automations = [
    { id: "reactivate", icon: "🔥", name: "Reactivar leads fríos", desc: "Envía mensajes de reactivación a leads sin actividad reciente", fn: runColdLeadReactivation },
    { id: "scoring", icon: "🎯", name: "Recalcular scoring dinámico", desc: "Recalcula el score de todos los leads con eventos y señales reales", fn: recalculateDynamicScoring },
    { id: "funnel", icon: "⚡", name: "Ejecutar funnel automático", desc: "Mueve leads por el pipeline según reglas de negocio definidas", fn: runAutomaticFunnel },
    { id: "onboarding", icon: "🚀", name: "Onboarding automático", desc: "Inicia el proceso de bienvenida para clientes que acaban de pagar", fn: runAutomaticOnboarding },
    { id: "voice", icon: "📞", name: "Ejecutar llamadas IA", desc: "Lanza llamadas automáticas a leads cualificados con score alto", fn: runVoiceCalls },
    { id: "priority", icon: "📊", name: "Recalcular prioridad", desc: "Reordena la cola de atención por urgencia comercial real", fn: recalculatePriority },
    { id: "upsells", icon: "📈", name: "Ejecutar upsells", desc: "Detecta clientes en plan bajo y les propone upgrade automático", fn: runUpsells },
    { id: "appointments", icon: "📅", name: "Recordatorios de citas", desc: "Envía recordatorios automáticos 24h y 1h antes de cada cita", fn: runAppointments },
  ];

  return (
    <div className="fade-up">
      <div className="section-header mb-4">
        <div className="section-title">Centro de automatizaciones</div>
        <Badge color="blue">{leads.length} leads activos</Badge>
      </div>
      <div className="grid-auto">
        {automations.map(a => (
          <div key={a.id} className="automation-card">
            <div className="automation-icon">{a.icon}</div>
            <div className="automation-name">{a.name}</div>
            <div className="automation-desc">{a.desc}</div>
            {results[a.id] && (
              <div className={`alert ${results[a.id].ok ? "alert-success" : "alert-error"} mb-3`}>
                {typeof results[a.id].msg === "string" ? results[a.id].msg : JSON.stringify(results[a.id].msg)}
              </div>
            )}
            <button onClick={() => run(a.id, a.fn)} disabled={running[a.id] || !a.fn} className="btn btn-primary" style={{ width: "100%" }}>
              {running[a.id] ? <><span className="spinner" /> Ejecutando...</> : "▶ Ejecutar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamView({ data, canAdmin, newUser, setNewUser, createUser, leadsByOwner }) {
  const { users = [], alerts = [], insights = [], auditLogs = [], settings = {} } = data;
  return (
    <div className="fade-up">
      <div className="grid-2 mb-4">
        {/* Team */}
        <div className="card">
          <div className="card-title">👥 Equipo comercial <div className="card-title-right"><Badge color="purple">{users.length}</Badge></div></div>
          {users.length === 0 ? <div className="empty">Sin usuarios.</div> : users.map(u => (
            <div key={u.id} className="card-sm mb-2 flex items-center justify-between">
              <div><div className="text-sm font-semibold">{u.full_name}</div><div className="text-xs text-muted">{u.email}</div></div>
              <Badge color="blue">{u.role}</Badge>
            </div>
          ))}
          {canAdmin && (
            <div className="mt-4">
              <div className="divider" />
              <div className="text-xs text-muted mb-3 text-upper">Crear usuario</div>
              <div className="flex-col gap-2" style={{ display: "flex" }}>
                <input value={newUser.full_name} onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))} placeholder="Nombre completo" className="input" />
                <input value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="Email" className="input" />
                <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} className="select">
                  {["owner","admin","manager","agent","viewer"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input value={newUser.phone} onChange={e => setNewUser(u => ({ ...u, phone: e.target.value }))} placeholder="Teléfono" className="input" />
                <input value={newUser.password || ""} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} placeholder="Contraseña temporal (opcional)" className="input" />
                <button onClick={createUser} className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>Crear usuario</button>
              </div>
            </div>
          )}
        </div>

        {/* Performance */}
        <div className="card">
          <div className="card-title">📊 Rendimiento del equipo</div>
          {leadsByOwner.length === 0 ? <div className="empty">Sin datos.</div> : leadsByOwner.map(row => (
            <div key={row.id} className="card-sm mb-2">
              <div className="flex justify-between mb-2"><span className="font-semibold text-sm">{row.full_name}</span><Badge color="blue">{row.leads} leads</Badge></div>
              <div className="grid-3" style={{ gap: 6 }}>
                {[["Cualif.", row.qualified], ["Ganados", row.won], ["Ingresos", fmtEur(row.revenue)]].map(([k, v]) => (
                  <div key={k} className="card-sm" style={{ padding: "8px 10px" }}>
                    <div className="text-xs text-muted">{k}</div>
                    <div className="text-sm font-bold">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts + Insights */}
      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">🚨 Alertas <div className="card-title-right"><Badge color="red">{alerts.length}</Badge></div></div>
          {alerts.length === 0 ? <div className="empty">Sin alertas activas.</div> : alerts.slice(0, 8).map(a => (
            <div key={a.id} className="card-sm mb-2">
              <div className="flex justify-between mb-1"><span className="text-sm font-semibold">{a.title}</span><Badge color={a.severity === "high" ? "red" : a.severity === "medium" ? "amber" : "blue"}>{a.severity || "info"}</Badge></div>
              <div className="text-xs text-dim">{a.message || "—"}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">💡 Insights IA <div className="card-title-right"><Badge color="purple">{insights.length}</Badge></div></div>
          {insights.length === 0 ? <div className="empty">Sin insights.</div> : insights.slice(0, 8).map((insight, i) => (
            <div key={insight.id || i} className="card-sm mb-2">
              <div className="text-sm font-semibold mb-1">{insight.title}</div>
              <div className="text-xs text-dim">{insight.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Objetivos + Audit */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">🎯 Objetivos mensuales</div>
          {[["Meta leads", settings.monthly_target_leads || 25], ["Meta conversión", `${settings.monthly_target_conversion || 20}%`], ["Valor por operación", fmtEur(settings.default_deal_value || 250)]].map(([k, v]) => (
            <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><span className="text-sm font-bold">{v}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Permisos disponibles</div>
          {[
            ["owner", "Control total del cliente, branding, billing y equipo."],
            ["admin", "Gestión operativa y acceso amplio al portal."],
            ["manager", "Coordina pipeline, equipo y automatizaciones."],
            ["agent", "Trabaja leads, follow-up y acciones comerciales."],
            ["viewer", "Solo lectura para reporting y seguimiento."],
          ].map(([role, description]) => (
            <div key={role} className="pipeline-row">
              <div className="flex-1">
                <div className="text-sm font-semibold">{role}</div>
                <div className="text-xs text-dim">{description}</div>
              </div>
              <Badge color="blue">{role}</Badge>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">📋 Registro de actividad <div className="card-title-right"><Badge color="blue">{auditLogs.length}</Badge></div></div>
          {auditLogs.length === 0 ? <div className="empty">Sin actividad.</div> : auditLogs.slice(0, 8).map(log => (
            <div key={log.id} className="pipeline-row">
              <div className="flex-1"><div className="text-sm">{log.action}</div><div className="text-xs text-muted">{log.entity_type} · {log.entity_id}</div></div>
              <div className="text-xs text-muted">{formatDate(log.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ data, canAdmin, brandingForm, setBrandingForm, saveBranding, portalSettingsForm, setPortalSettingsForm, savePortalSettings, portalSettingsSaving }) {
  const { client = {} } = data;
  return (
    <div className="fade-up">
      <div className="grid-2">
        <div className="card">
          <div className="card-title">🎨 Branding</div>
          <div className="flex-col gap-3" style={{ display: "flex" }}>
            {[["Nombre de marca", "brand_name", "text"], ["URL del logo", "brand_logo_url", "text"], ["Color principal", "primary_color", "text"], ["Color secundario", "secondary_color", "text"], ["Email del owner", "owner_email", "email"], ["Industria", "industry", "text"]].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1" style={{ display: "block" }}>{label}</label>
                <input type={type} disabled={!canAdmin} value={brandingForm?.[key] || ""} onChange={e => setBrandingForm(f => ({ ...f, [key]: e.target.value }))} className="input" />
              </div>
            ))}
            {canAdmin && <button onClick={saveBranding} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Guardar branding</button>}
          </div>
        </div>
        <div className="card">
          <div className="card-title">ℹ️ Información del cliente</div>
          {[["Plan", client.plan || "pro"], ["Estado", client.is_active !== false ? "Activo" : "Inactivo"], ["Llamadas límite", client.calls_limit || client.callsLimit || 0], ["Email owner", client.owner_email || "—"], ["Industria", client.industry || "—"]].map(([k, v]) => (
            <div key={k} className="pipeline-row"><span className="text-sm text-dim flex-1">{k}</span><span className="text-sm font-semibold">{String(v)}</span></div>
          ))}
        </div>
      </div>

      <div className="grid-2 mt-4">
        <div className="card">
          <div className="card-title">🧩 Operativa y reporting</div>
          <div className="flex-col gap-3" style={{ display: "flex" }}>
            {[["Email informe diario", "daily_report_email", "email"], ["Email informe semanal", "weekly_report_email", "email"], ["Refresh (seg)", "realtime_refresh_seconds", "number"], ["Valor por operación", "default_deal_value", "number"], ["Meta leads mes", "monthly_target_leads", "number"], ["Meta conversión %", "monthly_target_conversion", "number"]].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1" style={{ display: "block" }}>{label}</label>
                <input type={type} disabled={!canAdmin} value={portalSettingsForm?.[key] ?? ""} onChange={e => setPortalSettingsForm(f => ({ ...(f || {}), [key]: e.target.value }))} className="input" />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">🌐 White-label y canales</div>
          <div className="flex-col gap-3" style={{ display: "flex" }}>
            {[["Número Twilio", "twilio_number", "text"], ["Webhook", "webhook", "text"], ["Tagline", "tagline", "text"]].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1" style={{ display: "block" }}>{label}</label>
                <input type={type} disabled={!canAdmin} value={portalSettingsForm?.[key] ?? ""} onChange={e => setPortalSettingsForm(f => ({ ...(f || {}), [key]: e.target.value }))} className="input" />
              </div>
            ))}
            {canAdmin && <button onClick={savePortalSettings} disabled={portalSettingsSaving} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>{portalSettingsSaving ? "Guardando..." : "Guardar ajustes operativos"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadEvents, setLeadEvents] = useState([]);
  const [leadNotes, setLeadNotes] = useState([]);
  const [leadComments, setLeadComments] = useState([]);
  const [leadReminders, setLeadReminders] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [brandingForm, setBrandingForm] = useState(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [leadRevenue, setLeadRevenue] = useState(null);
  const [ownerRevenue, setOwnerRevenue] = useState(null);
  const [upsellStats, setUpsellStats] = useState(null);
  const [appointmentStats, setAppointmentStats] = useState(null);
  const [messageExperiments, setMessageExperiments] = useState([]);
  const [messageExperimentsMeta, setMessageExperimentsMeta] = useState(null);
  const [reactivationStats, setReactivationStats] = useState(null);
  const [voiceStats, setVoiceStats] = useState(null);
  const [priorityStats, setPriorityStats] = useState(null);
  const [billingData, setBillingData] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [playbookData, setPlaybookData] = useState(null);
  const [playbookForm, setPlaybookForm] = useState(null);
  const [playbookSaving, setPlaybookSaving] = useState(false);
  const [voiceQaData, setVoiceQaData] = useState(null);
  const [voiceCenterData, setVoiceCenterData] = useState(null);
  const [inboxData, setInboxData] = useState(null);
  const [strategyData, setStrategyData] = useState(null);
  const [brandLabData, setBrandLabData] = useState(null);
  const [portalSettingsForm, setPortalSettingsForm] = useState(null);
  const [portalSettingsSaving, setPortalSettingsSaving] = useState(false);
  const [domainLoading, setDomainLoading] = useState(false);
  const [selectedLeadMemory, setSelectedLeadMemory] = useState(null);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", role: "agent", phone: "", password: "" });
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [accountSetupForm, setAccountSetupForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [accountSetupLoading, setAccountSetupLoading] = useState(false);
  const [accountSetupMsg, setAccountSetupMsg] = useState("");
  const [accountSetupErr, setAccountSetupErr] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "all", owner: "all", interes: "all", ciudad: "all", producto: "all", minScore: "0", from: "", to: "" });
  const intervalRef = useRef(null);
  const refreshSeconds = data?.settings?.realtime_refresh_seconds || 30;
  const runLoadAll = useEffectEvent(() => {
    loadAll();
  });
  const runLoadOverview = useEffectEvent(() => {
    loadOverview();
  });

  // Load all data
  useEffect(() => {
    runLoadAll();
    intervalRef.current = setInterval(() => {
      runLoadOverview();
    }, refreshSeconds * 1000);
    return () => clearInterval(intervalRef.current);
  }, [refreshSeconds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setShowAccountSetup(params.get("setup_account") === "1" || params.get("checkout") === "success");
  }, []);

  useEffect(() => {
    if (!data?.currentUser && !data?.client) return;
    setAccountSetupForm(p => ({ ...p, email: p.email || data?.currentUser?.email || data?.client?.owner_email || "" }));
  }, [data]);

  useEffect(() => {
    if (!data?.client && !data?.settings) return;
    setPortalSettingsForm({
      daily_report_email: data?.settings?.daily_report_email || "",
      weekly_report_email: data?.settings?.weekly_report_email || "",
      realtime_refresh_seconds: data?.settings?.realtime_refresh_seconds || 15,
      default_deal_value: data?.settings?.default_deal_value || 250,
      monthly_target_leads: data?.settings?.monthly_target_leads || 25,
      monthly_target_conversion: data?.settings?.monthly_target_conversion || 20,
      twilio_number: data?.client?.twilio_number || "",
      webhook: data?.client?.webhook || "",
      tagline: data?.client?.tagline || "",
    });
  }, [data]);

  function loadAll() {
    loadOverview();
    loadRevenue();
    loadLeadRevenue();
    loadOwnerRevenue();
    loadBillingData();
    loadHealthData();
    loadPlaybooks();
    loadVoiceQa();
    loadVoiceCenterData();
    loadInboxData();
    loadReactivationStats();
    loadVoiceStats();
    loadPriorityStats();
    loadUpsellStats();
    loadAppointmentStats();
    loadMessageExperiments();
    loadStrategyData();
    loadBrandLabData();
  }

  async function loadOverview() {
    try {
      const res = await fetch("/api/portal/overview", { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/login?next=/portal");
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setData(json);
        if (json?.client) {
          setBrandingForm({
            brand_name: json.client.brand_name || "",
            brand_logo_url: json.client.brand_logo_url || "",
            primary_color: json.client.primary_color || "#ffffff",
            secondary_color: json.client.secondary_color || "#030303",
            owner_email: json.client.owner_email || "",
            industry: json.client.industry || "",
            logo_text: json.client.logo_text || "",
            custom_domain: json.client.custom_domain || "",
            accent: json.client.accent || BRAND_THEME_PRESETS[0].accent,
            accent_text: json.client.accent_text || BRAND_THEME_PRESETS[0].accent_text,
            button: json.client.button || BRAND_THEME_PRESETS[0].button,
            badge: json.client.badge || BRAND_THEME_PRESETS[0].badge,
          });
        }
      }
    } catch (e) { console.error(e); }
  }

  async function loadRevenue() { try { const r = await fetch("/api/analytics/revenue", { cache: "no-store" }); const j = await r.json(); if (j.success) setRevenue(j.data); } catch {} }
  async function loadLeadRevenue() { try { const r = await fetch("/api/analytics/lead-revenue", { cache: "no-store" }); const j = await r.json(); if (j.success) setLeadRevenue(j.data); } catch {} }
  async function loadOwnerRevenue() { try { const r = await fetch("/api/analytics/owner-revenue", { cache: "no-store" }); const j = await r.json(); if (j.success) setOwnerRevenue(j.data); } catch {} }
  async function loadBillingData() { try { const r = await fetch("/api/analytics/billing", { cache: "no-store" }); const j = await r.json(); if (j.success) setBillingData(j.data); } catch {} }
  async function loadHealthData() { try { const r = await fetch("/api/portal/health", { cache: "no-store" }); const j = await r.json(); if (j.success) setHealthData(j.data); } catch {} }
  async function loadPlaybooks() { try { const r = await fetch("/api/playbooks", { cache: "no-store" }); const j = await r.json(); if (j.success) { setPlaybookData(j.data); setPlaybookForm(j.data.workspace || null); } } catch {} }
  async function loadVoiceQa() { try { const r = await fetch("/api/portal/voice-qa", { cache: "no-store" }); const j = await r.json(); if (j.success) setVoiceQaData(j.data); } catch {} }
  async function loadVoiceCenterData() { try { const r = await fetch("/api/portal/voice-center", { cache: "no-store" }); const j = await r.json(); if (j.success) setVoiceCenterData(j.data); } catch {} }
  async function loadInboxData() { try { const r = await fetch("/api/portal/inbox", { cache: "no-store" }); const j = await r.json(); if (j.success) setInboxData(j.data); } catch {} }
  async function loadStrategyData() { try { const r = await fetch("/api/portal/strategy", { cache: "no-store" }); const j = await r.json(); if (j.success) setStrategyData(j.data); } catch {} }
  async function loadBrandLabData() { try { const r = await fetch("/api/portal/brand-lab", { cache: "no-store" }); const j = await r.json(); if (j.success) setBrandLabData(j.data); } catch {} }
  async function loadReactivationStats() { try { const r = await fetch("/api/analytics/reactivation-stats", { cache: "no-store" }); const j = await r.json(); if (j.success) setReactivationStats(j.data); } catch {} }
  async function loadVoiceStats() { try { const r = await fetch("/api/analytics/voice-stats", { cache: "no-store" }); const j = await r.json(); if (j.success) setVoiceStats(j.data); } catch {} }
  async function loadPriorityStats() { try { const r = await fetch("/api/analytics/priority-stats", { cache: "no-store" }); const j = await r.json(); if (j.success) setPriorityStats(j.data); } catch {} }
  async function loadUpsellStats() { try { const r = await fetch("/api/analytics/upsells", { cache: "no-store" }); const j = await r.json(); if (j.success) setUpsellStats(j.data); } catch {} }
  async function loadAppointmentStats() { try { const r = await fetch("/api/analytics/appointment-stats", { cache: "no-store" }); const j = await r.json(); if (j.success) setAppointmentStats(j.data); } catch {} }
  async function loadMessageExperiments() {
    try {
      const r = await fetch("/api/analytics/message-experiments", { cache: "no-store" });
      const j = await r.json();
      if (j.success) {
        setMessageExperiments(j.data || []);
        setMessageExperimentsMeta({
          summary: j.summary || null,
          channelBreakdown: j.channelBreakdown || [],
          stageBreakdown: j.stageBreakdown || [],
          suggestions: j.suggestions || [],
        });
      }
    } catch {}
  }

  async function openLead(lead) {
    setSelectedLead(lead);
    setSelectedLeadMemory(null);
    await loadLeadMemory(lead.id);
    const [eventsRes, notesRes, commentsRes, remindersRes] = await Promise.all([
      fetch(`/api/lead-events?lead_id=${lead.id}&phone=${encodeURIComponent(lead.telefono || "")}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/lead-notes?lead_id=${lead.id}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/lead-comments?lead_id=${lead.id}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/lead-reminders?lead_id=${lead.id}`, { cache: "no-store" }).then(r => r.json()),
    ]);
    setLeadEvents(eventsRes.data || []);
    setLeadNotes(notesRes.data || []);
    setLeadComments(commentsRes.data || []);
    setLeadReminders(remindersRes.data || []);
  }

  async function loadLeadMemory(leadId) {
    try {
      const res = await fetch(`/api/lead-memory?lead_id=${leadId}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setSelectedLeadMemory(json.data || null);
    } catch { setSelectedLeadMemory(null); }
  }

  async function saveLeadChanges(leadId, changes) {
    const res = await fetch("/api/leads/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, ...changes }) });
    const json = await readJsonResponse(res);
    await loadOverview();
    await loadInboxData();
    if (selectedLead?.id === leadId) { setSelectedLead(json.data); await openLead(json.data); }
  }

  async function addNote(leadId, body) {
    const res = await fetch("/api/lead-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, body }) });
    await readJsonResponse(res);
    if (selectedLead?.id === leadId) await openLead({ ...selectedLead, id: leadId });
  }

  async function addComment(leadId, body) {
    const res = await fetch("/api/lead-comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, body }) });
    await readJsonResponse(res);
    if (selectedLead?.id === leadId) await openLead({ ...selectedLead, id: leadId });
  }

  async function addReminder(leadId, title, remind_at, assigned_to) {
    const res = await fetch("/api/lead-reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, title, remind_at, assigned_to }) });
    await readJsonResponse(res);
    if (selectedLead?.id === leadId) await openLead({ ...selectedLead, id: leadId });
  }

  async function generateNextStep(lead) {
    try {
      const res = await fetch("/api/ai/next-step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id }) });
      const json = await readJsonResponse(res);
      alert("Siguiente paso generado.");
      await loadOverview();
      await openLead(json.data);
      await saveNextBestAction(json.data);
    } catch (e) { alert(e.message || "Error generando siguiente paso."); }
  }

  async function sendFollowupSms(lead, messageOverride = "", templateId = null) {
    try {
      setSendingSms(true);
      const message = messageOverride || lead.next_step_ai || `Hola ${lead.nombre || ""}, te escribimos para continuar con tu solicitud.`;
      const res = await fetch("/api/followup/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, to: lead.telefono, message, templateId }) });
      const json = await readJsonResponse(res);
      alert("SMS enviado.");
      await loadOverview();
      await openLead(json.data || lead);
    } catch (e) { alert(e.message || "Error enviando SMS."); } finally { setSendingSms(false); }
  }

  async function saveNextBestAction(lead) {
    try {
      const res = await fetch("/api/ai/next-best-action/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, clientId: lead.client_id || data?.client?.id, brandName: data?.client?.brand_name || data?.client?.name || "nuestro equipo", useAI: true }) });
      const json = await readJsonResponse(res);
      await loadOverview();
      if (selectedLead?.id === lead.id) await openLead(json.data);
      alert("Acción actualizada.");
    } catch (e) { alert(e.message || "Error calculando acción."); }
  }

  async function executeRecommendedAction(lead) {
    try {
      const res = await fetch("/api/automation/execute-next-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, clientId: lead.client_id || data?.client?.id }) });
      const json = await readJsonResponse(res);
      if (json.mode === "whatsapp" && json.url) window.open(json.url, "_blank");
      await loadOverview();
      alert("Acción ejecutada.");
    } catch (e) { alert(e.message || "Error ejecutando acción."); }
  }

  function openLeadWhatsApp(lead) {
    const phone = normalizePhoneForWhatsApp(lead.telefono);
    if (!phone) { alert("Sin teléfono válido."); return; }
    const baseTemplate = (data?.whatsappTemplates || [])[0]?.text || "Hola {{nombre}}, te escribimos de {{empresa}} para continuar con tu solicitud.";
    const text = renderTemplateText(baseTemplate, lead, data?.client?.brand_name || data?.client?.name || "nuestro equipo");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function quickSms(lead) {
    const template = (data?.smsTemplates || [])[0]?.text || "Hola {{nombre}}, te escribimos de {{empresa}} para continuar con tu solicitud.";
    const message = renderTemplateText(template, lead, data?.client?.brand_name || data?.client?.name || "nuestro equipo");
    await sendFollowupSms(lead, message, (data?.smsTemplates || [])[0]?.id || null);
  }

  function getAutoProductTier(lead) {
    const score = Number(lead?.score || 0), prob = Number(lead?.predicted_close_probability || 0), value = Number(lead?.valor_estimado || 0);
    const interes = String(lead?.interes || "").toLowerCase(), nextAction = String(lead?.next_action || "").toLowerCase();
    if (prob >= 85 || score >= 85 || value >= 1000 || interes === "alto" || nextAction === "call") return "premium";
    if (prob >= 60 || score >= 60 || interes === "medio" || nextAction === "whatsapp") return "pro";
    return "basic";
  }

  async function openCheckoutForLead(lead, plan = null) {
    try {
      const resolvedPlan = plan || getAutoProductTier(lead);
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: data?.client?.id, leadId: lead.id, plan: resolvedPlan, phone: lead.telefono || "", email: lead.email || "", name: lead.nombre || "" }) });
      const json = await res.json();
      if (!json.success || !json.url) { alert(json.message || "No se pudo abrir el checkout."); return; }
      window.open(json.url, "_blank");
    } catch (e) { alert(e.message || "Error abriendo checkout."); }
  }

  // Bulk actions
  async function bulkMarkContacted() {
    if (!selectedLeadIds.length) { alert("Sin leads seleccionados."); return; }
    await Promise.all(selectedLeadIds.map(leadId => fetch("/api/leads/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, status: "contacted", ultima_accion: "Acción masiva" }) }).then(r => r.json())));
    setSelectedLeadIds([]); await loadOverview(); alert("Leads actualizados.");
  }

  function bulkOpenWhatsapp() {
    if (!selectedLeadIds.length) { alert("Sin leads seleccionados."); return; }
    (data?.leads || []).filter(l => selectedLeadIds.includes(l.id)).forEach(lead => openLeadWhatsApp(lead));
  }

  async function bulkSendSms() {
    if (!selectedLeadIds.length) { alert("Sin leads seleccionados."); return; }
    setSendingSms(true);
    const leads = (data?.leads || []).filter(l => selectedLeadIds.includes(l.id));
    await Promise.all(leads.map(async lead => {
      const message = renderTemplateText((data?.smsTemplates || [])[0]?.text || "Hola {{nombre}}, seguimos con tu solicitud", lead, data?.client?.brand_name || "nuestro equipo");
      await fetch("/api/followup/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, to: lead.telefono, message }) });
    }));
    setSelectedLeadIds([]); await loadOverview(); setSendingSms(false); alert("SMS enviados.");
  }

  async function bulkExecuteAI() {
    if (!selectedLeadIds.length) { alert("Sin leads seleccionados."); return; }
    await Promise.all(selectedLeadIds.map(leadId => fetch("/api/automation/execute-next-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, clientId: data?.client?.id }) }).then(r => r.json())));
    setSelectedLeadIds([]); await loadOverview(); alert("IA ejecutada.");
  }

  // Other actions
  async function saveBranding() {
    const res = await fetch("/api/portal/branding/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brandingForm) });
    const json = await res.json();
    if (!json.success) { alert(json.message || "Error guardando branding."); return; }
    await loadOverview(); await loadBrandLabData(); alert("Branding actualizado.");
  }

  async function savePortalSettings() {
    try {
      setPortalSettingsSaving(true);
      const res = await fetch("/api/portal/settings/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(portalSettingsForm || {}) });
      const json = await readJsonResponse(res);
      await loadOverview();
      await loadHealthData();
      await loadBrandLabData();
      await loadStrategyData();
      alert(json.message || "Ajustes operativos actualizados.");
    } catch (e) {
      alert(e.message || "Error guardando ajustes.");
    } finally {
      setPortalSettingsSaving(false);
    }
  }

  async function connectCustomDomain() {
    if (!brandingForm?.custom_domain) {
      alert("Indica primero un dominio.");
      return;
    }

    try {
      setDomainLoading(true);
      const res = await fetch("/api/portal/domain/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: brandingForm.custom_domain }),
      });
      const json = await readJsonResponse(res);
      await loadOverview();
      await loadBrandLabData();
      alert(json.message || "Dominio actualizado.");
    } catch (error) {
      alert(error.message || "No se pudo conectar el dominio.");
    } finally {
      setDomainLoading(false);
    }
  }

  async function savePlaybook() {
    try {
      setPlaybookSaving(true);
      const res = await fetch("/api/playbooks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: playbookForm || {} }) });
      const json = await readJsonResponse(res);
      setPlaybookData(current => current ? { ...current, workspace: json.data.workspace } : current);
      setPlaybookForm(json.data.workspace);
      await loadOverview();
      alert(json.message || "Playbook actualizado.");
    } catch (e) {
      alert(e.message || "Error guardando playbook.");
    } finally {
      setPlaybookSaving(false);
    }
  }

  async function createUser() {
    const res = await fetch("/api/portal/users/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newUser) });
    const json = await res.json();
    if (!json.success) { alert(json.message || "Error creando usuario."); return; }
    setNewUser({ full_name: "", email: "", role: "agent", phone: "", password: "" }); await loadOverview();
  }

  async function openBillingPortal() {
    try { setBillingLoading(true); const res = await fetch("/api/stripe/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); const json = await readJsonResponse(res); if (json?.url) { window.location.href = json.url; return; } alert(json?.message || "Portal no disponible."); } catch (e) { alert(e?.message || "Error."); } finally { setBillingLoading(false); }
  }

  async function openCheckout(plan = "pro") {
    try { setBillingLoading(true); const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) }); const json = await readJsonResponse(res); if (json?.url) { window.location.href = json.url; return; } alert(json?.message || "Checkout no disponible."); } catch (e) { alert(e?.message || "Error."); } finally { setBillingLoading(false); }
  }

  function exportCsv() { window.location.href = "/api/leads/export"; }
  async function sendDailyReport() { const r = await fetch("/api/daily-report/send", { method: "POST" }); const j = await r.json(); alert(j.success ? "Informe diario enviado." : j.message || "Error."); }
  async function sendWeeklyReport() { const r = await fetch("/api/weekly-report/send", { method: "POST" }); const j = await r.json(); alert(j.success ? "Informe semanal enviado." : j.message || "Error."); }
  async function runNightly() { const r = await fetch("/api/nightly", { method: "POST" }); const j = await r.json(); alert(j.success ? "Proceso nocturno ejecutado." : j.message || "Error."); await loadOverview(); await loadHealthData(); await loadInboxData(); await loadVoiceCenterData(); }

  async function recalculateAllNextActions() {
    const res = await fetch("/api/automation/recalculate-next-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: data?.client?.id }) });
    const j = await res.json();
    if (!j.success) { alert(j.message || "Error."); return; }
    await loadOverview(); alert(`Acciones recalculadas. Procesados: ${j.processed}. Fallidos: ${j.failed}.`);
  }

  async function runAutomaticFunnel() { const r = await fetch("/api/automation/run-funnel", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadOverview(); await loadInboxData(); alert(`Funnel ejecutado. ${j.processed} procesados.`); }
  async function recalculateDynamicScoring() { const r = await fetch("/api/automation/recalculate-dynamic-score", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadOverview(); alert(`Scoring recalculado. ${j.processed} procesados.`); }
  async function runColdLeadReactivation() { const r = await fetch("/api/automation/reactivate-cold-leads", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadOverview(); await loadInboxData(); alert(`Reactivación completada. ${j.processed} procesados.`); }
  async function runAutomaticOnboarding() { const r = await fetch("/api/automation/run-onboarding", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadOverview(); await loadInboxData(); alert(`Onboarding ejecutado. ${j.processed} procesados.`); }
  async function runVoiceCalls() { const r = await fetch("/api/automation/run-voice-calls", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadOverview(); await loadVoiceStats(); await loadVoiceQa(); await loadVoiceCenterData(); await loadInboxData(); alert(`Llamadas IA ejecutadas. ${j.processed} procesados.`); }
  async function recalculatePriority() { const r = await fetch("/api/automation/recalculate-priority", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadOverview(); await loadPriorityStats(); alert(`Prioridad recalculada. ${j.processed} procesados.`); }
  async function runUpsells() { const r = await fetch("/api/automation/run-upsells", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadUpsellStats(); alert(`Upsells ejecutados. ${j.processed} procesados.`); }
  async function runAppointments() { const r = await fetch("/api/automation/run-appointment-reminders", { method: "POST" }); const j = await r.json(); if (!j.success) { alert(j.message || "Error."); return; } await loadAppointmentStats(); alert(`Recordatorios enviados. ${j.processed} procesados.`); }

  async function saveAccountSetup() {
    if (!accountSetupForm.email || !accountSetupForm.password) { setAccountSetupErr("Completa email y contraseña."); return; }
    if (accountSetupForm.password !== accountSetupForm.confirmPassword) { setAccountSetupErr("Las contraseñas no coinciden."); return; }
    try {
      setAccountSetupLoading(true); setAccountSetupErr(""); setAccountSetupMsg("");
      const res = await fetch("/api/portal/account/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: accountSetupForm.email, password: accountSetupForm.password }) });
      const json = await readJsonResponse(res);
      setAccountSetupMsg(json.message || "Cuenta guardada."); setAccountSetupForm(p => ({ ...p, password: "", confirmPassword: "" }));
      const nextUrl = new URL(window.location.href); nextUrl.searchParams.delete("setup_account"); window.history.replaceState({}, "", nextUrl.toString());
      await loadOverview();
    } catch (e) { setAccountSetupErr(e?.message || "Error guardando cuenta."); } finally { setAccountSetupLoading(false); }
  }

  // Derived data
  const availableCities = useMemo(() => [...new Set((data?.leads || []).map(l => l.ciudad).filter(Boolean))], [data]);

  const filteredLeads = useMemo(() => {
    const leads = data?.leads || [];
    const result = leads.filter(lead => {
      const score = Number(lead.score || 0);
      const statusOk = filters.status === "all" ? true : lead.status === filters.status;
      const ownerOk = filters.owner === "all" ? true : filters.owner === "unassigned" ? !lead.owner : lead.owner === filters.owner;
      const interesOk = filters.interes === "all" ? true : String(lead.interes || "").toLowerCase() === filters.interes;
      const ciudadOk = filters.ciudad === "all" ? true : String(lead.ciudad || "") === filters.ciudad;
      const productoOk = filters.producto === "all" ? true : getRecommendedProductTier(lead) === filters.producto;
      const scoreOk = score >= Number(filters.minScore || 0);
      const q = filters.search.toLowerCase();
      const searchOk = !q || [lead.nombre, lead.telefono, lead.necesidad, lead.email].some(f => String(f || "").toLowerCase().includes(q));
      const created = lead.created_at ? new Date(lead.created_at).getTime() : 0;
      const fromOk = filters.from ? created >= new Date(filters.from).getTime() : true;
      const toOk = filters.to ? created <= new Date(filters.to + "T23:59:59").getTime() : true;
      return statusOk && ownerOk && interesOk && ciudadOk && productoOk && scoreOk && searchOk && fromOk && toOk;
    });
    return result.sort((a, b) => {
      const rank = v => ({ urgente: 4, alta: 3, media: 2 }[String(v || "").toLowerCase()] || 1);
      if (rank(b.priority_bucket) !== rank(a.priority_bucket)) return rank(b.priority_bucket) - rank(a.priority_bucket);
      return Number(b.predicted_close_probability || 0) - Number(a.predicted_close_probability || 0);
    });
  }, [data, filters]);

  const leadsByOwner = useMemo(() => {
    const users = data?.users || [];
    const leads = data?.leads || [];
    const settings = data?.settings || {};
    return users.map(user => {
      const owned = leads.filter(l => l.owner === user.full_name);
      return { id: user.id, full_name: user.full_name, role: user.role, leads: owned.length, won: owned.filter(l => l.status === "won").length, qualified: owned.filter(l => l.status === "qualified").length, revenue: owned.reduce((a, l) => a + Number(l.valor_estimado || settings.default_deal_value || 0), 0) };
    });
  }, [data]);

  const usagePressure = useMemo(() => computeUsagePressure({ data, billingData }), [data, billingData]);
  const onboarding = useMemo(() => buildOnboardingChecklist({ data, billingData, healthData }), [data, billingData, healthData]);
  const onboardingWorkspace = useMemo(() => buildOnboardingWorkspace({ data, billingData, healthData, playbookData }), [data, billingData, healthData, playbookData]);
  const notifications = useMemo(() => buildDerivedNotifications({ data, billingData, healthData, voiceQaData }), [data, billingData, healthData, voiceQaData]);
  const roiSnapshot = useMemo(() => buildRoiSnapshot({ data, revenue, billingData, leadRevenue, ownerRevenue }), [data, revenue, billingData, leadRevenue, ownerRevenue]);
  const experimentSnapshot = useMemo(() => messageExperimentsMeta || buildMessageExperimentSummary({ variants: messageExperiments }), [messageExperiments, messageExperimentsMeta]);
  const strategySnapshot = useMemo(() => {
    const base = buildStrategySnapshot({
      client: data?.client || {},
      settings: data?.settings || {},
      leads: data?.leads || [],
      calls: data?.calls || [],
      payments: [],
      benchmarks: data?.benchmarks || [],
      experiments: experimentSnapshot,
      productPerformance: strategyData?.productFocus || [],
      ownerRanking: ownerRevenue?.ranking || strategyData?.ownerFocus || [],
    });

    if (!strategyData) {
      return base;
    }

    return {
      ...strategyData,
      benchmarkCards: base.benchmarkCards,
      ownerFocus: ownerRevenue?.ranking?.length
        ? ownerRevenue.ranking.slice(0, 6)
        : strategyData.ownerFocus || base.ownerFocus,
      experiments: experimentSnapshot?.summary || strategyData.experiments || null,
      benchmarkHistory: strategyData.benchmarkHistory || base.benchmarkHistory,
      story: strategyData.story || base.story,
    };
  }, [strategyData, data, experimentSnapshot, ownerRevenue]);
  const brandLabWorkspace = useMemo(() => brandLabData || buildBrandLabWorkspace({
    client: data?.client || {},
    settings: data?.settings || {},
    products: [],
    services: healthData?.services || {},
  }), [brandLabData, data, healthData]);

  if (!data) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-3)", fontFamily: "var(--font)", gap: 12 }}>
          <span className="spinner" style={{ width: 20, height: 20 }} /> Cargando portal...
        </div>
      </>
    );
  }

  const { client = {}, users = [], calls = [], smsTemplates = [], whatsappTemplates = [], settings = {} } = data;
  const currentRole = data.currentRole || "viewer";
  const canEdit = ["owner", "admin", "manager", "agent"].includes(currentRole);
  const canAdmin = ["owner", "admin"].includes(currentRole);

  const navItems = [
    { id: "dashboard", icon: "⬡", label: "Dashboard" },
    { id: "onboarding", icon: "🚀", label: "Onboarding" },
    { id: "inbox", icon: "💬", label: "Inbox" },
    { id: "notifications", icon: "🔔", label: "Alertas" },
    { id: "pipeline", icon: "◈", label: "Pipeline" },
    { id: "leads", icon: "◉", label: "Leads" },
    { id: "voice", icon: "🎙", label: "Voice" },
    { id: "analytics", icon: "📊", label: "Analytics" },
    { id: "strategy", icon: "🎯", label: "Strategy" },
    { id: "experiments", icon: "🧪", label: "Experiments" },
    { id: "roi", icon: "💸", label: "ROI" },
    { id: "billing", icon: "💳", label: "Billing" },
    { id: "brandlab", icon: "✨", label: "Brand Lab" },
    { id: "playbooks", icon: "🧠", label: "Playbooks" },
    { id: "automations", icon: "⚡", label: "Automatiz." },
    { id: "operations", icon: "🛟", label: "Ops" },
    { id: "team", icon: "👥", label: "Equipo" },
    { id: "settings", icon: "⚙", label: "Ajustes" },
  ];

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}

    window.location.href = "/login";
  }

  const selectedCall = selectedLead
    ? (calls || []).find(call => {
        const leadPhone = normalizePhoneForWhatsApp(selectedLead.telefono);
        const callPhones = [
          normalizePhoneForWhatsApp(call.from_number),
          normalizePhoneForWhatsApp(call.to_number),
        ].filter(Boolean);
        const samePhone = leadPhone && callPhones.includes(leadPhone);
        const sameDate = selectedLead.created_at && call.created_at && new Date(selectedLead.created_at).toDateString() === new Date(call.created_at).toDateString();
        const sameName = selectedLead.nombre && call.summary && call.summary.toLowerCase().includes(String(selectedLead.nombre).toLowerCase());
        return samePhone || sameDate || sameName;
      }) || null
    : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="portal">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            {client.brand_logo_url
              ? <img src={client.brand_logo_url} alt="logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
              : <div className="sidebar-logo-icon">{(client.brand_name || client.name || "N").slice(0, 1)}</div>
            }
            <div>
              <div className="sidebar-logo-name">{client.brand_name || client.name || "Portal"}</div>
              <div className="sidebar-logo-sub">{currentRole}</div>
            </div>
          </div>
          <div className="nav-section">Principal</div>
          {navItems.map(item => (
            <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div className="nav-section">Sistema</div>
          <button className="nav-item" onClick={logout}>
            <span className="nav-icon">↩</span> Salir
          </button>
        </aside>

        {/* Main */}
        <div className="main">
          {/* Topbar */}
          <div className="topbar">
            <div style={{ flex: 1 }}>
              <div className="topbar-kicker">Portal premium</div>
              <div className="topbar-title">{navItems.find(n => n.id === view)?.label || "Portal"}</div>
            </div>
            <div className="topbar-search">
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>🔍</span>
              <input placeholder="Buscar leads..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </div>
            <div className="topbar-meta">
              <Badge color={notifications.length > 0 ? "amber" : "green"}>
                {notifications.length} alertas
              </Badge>
              <Badge color={filteredLeads.filter(l => l.next_action_priority === "urgente").length > 0 ? "red" : "default"}>
                {filteredLeads.filter(l => l.next_action_priority === "urgente").length} urgentes
              </Badge>
              <Badge color="blue">{filteredLeads.length} leads</Badge>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
          </div>

          {/* Account setup banner */}
          {showAccountSetup && (
            <div className="alert alert-success" style={{ margin: "16px 24px 0", borderRadius: "var(--radius)" }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>✅ Pago completado — Configura tu acceso</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input type="email" value={accountSetupForm.email} onChange={e => setAccountSetupForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="input" />
                <input type="password" value={accountSetupForm.password} onChange={e => setAccountSetupForm(p => ({ ...p, password: e.target.value }))} placeholder="Nueva contraseña" className="input" />
                <input type="password" value={accountSetupForm.confirmPassword} onChange={e => setAccountSetupForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Repite contraseña" className="input" />
              </div>
              {accountSetupErr && <div className="alert alert-error mb-2">{accountSetupErr}</div>}
              {accountSetupMsg && <div className="alert alert-success mb-2">{accountSetupMsg}</div>}
              <button onClick={saveAccountSetup} disabled={accountSetupLoading} className="btn btn-primary btn-sm">{accountSetupLoading ? "Guardando..." : "Guardar acceso"}</button>
            </div>
          )}

          {/* Content */}
          <div className="content">
            {view === "dashboard" && (
              <DashboardView
                data={data} filteredLeads={filteredLeads} revenue={revenue} voiceStats={voiceStats}
                priorityStats={priorityStats} reactivationStats={reactivationStats} leadRevenue={leadRevenue}
                ownerRevenue={ownerRevenue} upsellStats={upsellStats} appointmentStats={appointmentStats}
                billingData={billingData} healthData={healthData} onboarding={onboarding}
                notifications={notifications} usagePressure={usagePressure}
                onOpenLead={openLead} onOpenCheckout={openCheckoutForLead} exportCsv={exportCsv}
                openCheckout={openCheckout} openBillingPortal={openBillingPortal} billingLoading={billingLoading}
                onNavigate={setView}
                sendDailyReport={sendDailyReport} sendWeeklyReport={sendWeeklyReport} runNightly={runNightly}
                recalculateAllNextActions={recalculateAllNextActions} runAutomaticFunnel={runAutomaticFunnel}
                recalculateDynamicScoring={recalculateDynamicScoring} runColdLeadReactivation={runColdLeadReactivation}
              />
            )}
            {view === "onboarding" && (
              <OnboardingView
                workspace={onboardingWorkspace}
                onNavigate={setView}
              />
            )}
            {view === "inbox" && (
              <InboxView
                inboxData={inboxData}
                leads={data?.leads || []}
                onOpenLead={openLead}
              />
            )}
            {view === "notifications" && (
              <NotificationsView
                notifications={notifications}
                data={data}
                onNavigate={setView}
              />
            )}
            {view === "pipeline" && (
              <PipelineView
                filteredLeads={filteredLeads} canEdit={canEdit} settings={settings}
                onOpenLead={openLead} onSaveLeadChanges={saveLeadChanges} getEstadoLabel={getEstadoLabel}
              />
            )}
            {view === "leads" && (
              <LeadsTableView
                filteredLeads={filteredLeads} selectedLeadIds={selectedLeadIds}
                setSelectedLeadIds={setSelectedLeadIds} settings={settings} sendingSms={sendingSms}
                canEdit={canEdit} data={data} onOpenLead={openLead} onSaveLeadChanges={saveLeadChanges}
                onSaveNextBestAction={saveNextBestAction} onExecuteRecommendedAction={executeRecommendedAction}
                onOpenCheckoutForLead={openCheckoutForLead} onQuickSms={quickSms} onOpenLeadWhatsApp={openLeadWhatsApp}
                bulkMarkContacted={bulkMarkContacted} bulkSendSms={bulkSendSms}
                bulkOpenWhatsapp={bulkOpenWhatsapp} bulkExecuteAI={bulkExecuteAI}
                filters={filters} setFilters={setFilters} users={users} availableCities={availableCities}
              />
            )}
            {view === "voice" && (
              <VoiceCenterView
                voiceCenterData={voiceCenterData}
                leads={data?.leads || []}
                onOpenLead={openLead}
              />
            )}
            {view === "analytics" && (
              <AnalyticsView
                data={data} revenue={revenue} leadRevenue={leadRevenue} ownerRevenue={ownerRevenue}
                voiceStats={voiceStats} priorityStats={priorityStats} reactivationStats={reactivationStats}
                upsellStats={upsellStats} appointmentStats={appointmentStats} messageExperiments={messageExperiments}
                filteredLeads={filteredLeads} settings={settings}
              />
            )}
            {view === "strategy" && (
              <StrategyView
                strategyData={strategySnapshot}
                onNavigate={setView}
              />
            )}
            {view === "experiments" && (
              <ExperimentsView
                experiments={messageExperiments}
                experimentsMeta={experimentSnapshot}
              />
            )}
            {view === "roi" && (
              <RoiView
                roiSnapshot={roiSnapshot}
                leadRevenue={leadRevenue}
                ownerRevenue={ownerRevenue}
                openCheckout={openCheckout}
                openBillingPortal={openBillingPortal}
                billingLoading={billingLoading}
              />
            )}
            {view === "billing" && (
              <BillingView
                data={data}
                billingData={billingData}
                revenue={revenue}
                usagePressure={usagePressure}
                openCheckout={openCheckout}
                openBillingPortal={openBillingPortal}
                billingLoading={billingLoading}
              />
            )}
            {view === "brandlab" && (
              <BrandLabView
                brandLabData={brandLabWorkspace}
                brandingForm={brandingForm}
                setBrandingForm={setBrandingForm}
                saveBranding={saveBranding}
                portalSettingsForm={portalSettingsForm}
                setPortalSettingsForm={setPortalSettingsForm}
                savePortalSettings={savePortalSettings}
                portalSettingsSaving={portalSettingsSaving}
                canAdmin={canAdmin}
                connectCustomDomain={connectCustomDomain}
                domainLoading={domainLoading}
              />
            )}
            {view === "playbooks" && (
              <PlaybooksView
                data={data}
                playbookData={playbookData}
                playbookForm={playbookForm}
                setPlaybookForm={setPlaybookForm}
                savePlaybook={savePlaybook}
                playbookSaving={playbookSaving}
                canEdit={canEdit}
              />
            )}
            {view === "automations" && (
              <AutomationsView
                leads={data?.leads || []}
                runColdLeadReactivation={runColdLeadReactivation}
                recalculateDynamicScoring={recalculateDynamicScoring}
                runAutomaticFunnel={runAutomaticFunnel}
                runAutomaticOnboarding={runAutomaticOnboarding}
                runVoiceCalls={runVoiceCalls}
                recalculatePriority={recalculatePriority}
                runUpsells={runUpsells}
                runAppointments={runAppointments}
              />
            )}
            {view === "operations" && (
              <OperationsView
                data={data}
                healthData={healthData}
                voiceQaData={voiceQaData}
                runNightly={runNightly}
              />
            )}
            {view === "team" && (
              <TeamView
                data={data} canAdmin={canAdmin} newUser={newUser}
                setNewUser={setNewUser} createUser={createUser} leadsByOwner={leadsByOwner}
              />
            )}
            {view === "settings" && (
              <SettingsView
                data={data} canAdmin={canAdmin} brandingForm={brandingForm}
                setBrandingForm={setBrandingForm} saveBranding={saveBranding}
                portalSettingsForm={portalSettingsForm} setPortalSettingsForm={setPortalSettingsForm}
                savePortalSettings={savePortalSettings} portalSettingsSaving={portalSettingsSaving}
              />
            )}
          </div>
        </div>

        {/* Lead Drawer */}
        {selectedLead && (
          <LeadDrawer
            key={`${selectedLead.id}:${selectedLead.updated_at || ""}:${selectedLead.next_step_ai || ""}`}
            lead={selectedLead} events={leadEvents} notes={leadNotes}
            comments={leadComments} reminders={leadReminders} call={selectedCall}
            users={users} canEdit={canEdit} sendingSms={sendingSms}
            smsTemplates={smsTemplates} whatsappTemplates={whatsappTemplates}
            clientBrand={client.brand_name || client.name || "nuestro equipo"}
            selectedLeadMemory={selectedLeadMemory}
            onClose={() => { setSelectedLead(null); setLeadEvents([]); setLeadNotes([]); setLeadComments([]); setLeadReminders([]); setSelectedLeadMemory(null); }}
            onSave={saveLeadChanges} onAddNote={addNote} onAddComment={addComment}
            onAddReminder={addReminder} onGenerateNextStep={generateNextStep}
            onSendFollowupSms={sendFollowupSms} onSaveNextBestAction={saveNextBestAction}
            onExecuteRecommendedAction={executeRecommendedAction}
            onOpenCheckout={openCheckoutForLead} onRunVoiceCalls={runVoiceCalls}
            onRecalculatePriority={recalculatePriority}
          />
        )}
      </div>
    </>
  );
}
