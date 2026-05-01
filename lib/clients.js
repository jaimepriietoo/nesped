import { safeUpsertClientSettings } from "@/lib/client-settings";

export const CLIENTS = {
  demo: {
    id: "demo",
    name: "NESPED Demo",
    brandName: "NESPED Demo",
    type: "IA comercial",
    status: "Activo",
    tagline: "Automatización de llamadas y captación de leads con IA",
    logoText: "N",
    ownerEmail: "jaimeprietomodrono@icloud.com",
    industry: "IA comercial",
    primaryColor: "#79a8ff",
    secondaryColor: "#05070a",
    prompt:
      "Representas a NESPED Demo. Si te preguntan quién llama o de parte de quién hablas, responde que llamas de NESPED Demo.",
    theme: {
      accent: "bg-blue-500/20",
      accentText: "text-blue-300",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-emerald-500/15 text-emerald-300",
    },
  },

  clinica: {
    id: "clinica",
    name: "Clínica Dental",
    brandName: "Clínica Dental",
    type: "Recepción médica",
    status: "Activo",
    tagline: "Recepción inteligente para pacientes y citas",
    logoText: "C",
    ownerEmail: "clinica@nesped.com",
    industry: "Salud",
    primaryColor: "#72dfb5",
    secondaryColor: "#05070a",
    prompt:
      "Representas a Clínica Dental. Si te preguntan quién llama o de parte de quién hablas, responde que llamas de Clínica Dental.",
    theme: {
      accent: "bg-emerald-500/20",
      accentText: "text-emerald-300",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-cyan-500/15 text-cyan-300",
    },
  },

  globetelecom: {
    id: "globetelecom",
    name: "Globetelecom",
    brandName: "Globetelecom",
    type: "Telecomunicaciones",
    status: "Activo",
    tagline: "Captación, soporte comercial y seguimiento automatizado para telecomunicaciones.",
    logoText: "G",
    ownerEmail: "globetelecom@nesped.com",
    industry: "Telecomunicaciones",
    primaryColor: "#a78bfa",
    secondaryColor: "#070a12",
    prompt:
      "Representas a Globetelecom. Si te preguntan quién llama o de parte de quién hablas, responde siempre que llamas de Globetelecom.",
    theme: {
      accent: "bg-violet-500/20",
      accentText: "text-violet-200",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-fuchsia-500/15 text-fuchsia-200",
    },
  },
};

export const CLIENT_LIST = Object.values(CLIENTS);

export function getClientById(clientId) {
  return CLIENTS[clientId] || CLIENTS.demo;
}

export function isDemoClientId(clientId) {
  return Boolean(clientId && CLIENTS[clientId]);
}

export function mapClientToPublicShape(client) {
  return {
    id: client.id,
    name: client.name,
    brandName: client.brandName || client.brand_name || client.name,
    brandLogoUrl: client.brandLogoUrl || client.brand_logo_url || "",
    type: client.type || "",
    status: client.status || "Activo",
    tagline: client.tagline || "",
    logoText: client.logoText || client.logo_text || "",
    customDomain: client.customDomain || client.custom_domain || "",
    theme: {
      accent: client.theme?.accent || client.accent || "bg-blue-500/20",
      accentText:
        client.theme?.accentText || client.accent_text || "text-blue-300",
      button:
        client.theme?.button || client.button || "bg-white text-black hover:bg-white/90",
      badge:
        client.theme?.badge || client.badge || "bg-emerald-500/15 text-emerald-300",
    },
  };
}

export async function ensureDemoWorkspace(supabase, clientId) {
  if (!supabase || !isDemoClientId(clientId)) return null;

  const seed = getClientById(clientId);

  const { data: existing, error: existingError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "No se pudo verificar el cliente demo");
  }

  if (!existing) {
    const { error: clientError } = await supabase.from("clients").insert({
      id: seed.id,
      name: seed.name,
      brand_name: seed.brandName || seed.name,
      owner_email: seed.ownerEmail || null,
      industry: seed.industry || null,
      tagline: seed.tagline || null,
      logo_text: seed.logoText || null,
      primary_color: seed.primaryColor || null,
      secondary_color: seed.secondaryColor || null,
      prompt: seed.prompt || null,
    });

    if (clientError) {
      throw new Error(clientError.message || "No se pudo crear el cliente demo");
    }
  }

  const { error: settingsError } = await safeUpsertClientSettings(
    supabase,
    {
      client_id: seed.id,
      weekly_report_email: seed.ownerEmail || null,
      daily_report_email: seed.ownerEmail || null,
    },
    { onConflict: "client_id" }
  );

  if (settingsError) {
    throw new Error(
      settingsError.message || "No se pudo preparar la configuración del cliente demo"
    );
  }

  return seed;
}
