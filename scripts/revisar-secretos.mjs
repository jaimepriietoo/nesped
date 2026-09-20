import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PATRONES = [
  ["clave de OpenAI", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["clave secreta con prefijo sk_", /\bsk_[a-f0-9]{24,}\b/gi],
  ["clave de Stripe en vivo", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g],
  ["token de GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["token de Slack", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["access key de AWS", /\bAKIA[0-9A-Z]{16}\b/g],
  ["clave de Google", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["clave privada", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const VARIABLES_SENSIBLES = [
  ["ELEVENLABS", "API", "KEY"],
  ["OPENAI", "API", "KEY"],
  ["STRIPE", "SECRET", "KEY"],
  ["STRIPE", "WEBHOOK", "SECRET"],
  ["STRIPE", "SUBSCRIPTION", "WEBHOOK", "SECRET"],
  ["SUPABASE", "SERVICE", "ROLE", "KEY"],
  ["TWILIO", "AUTH", "TOKEN"],
  ["RESEND", "API", "KEY"],
  ["NESPED", "SESSION", "SECRET"],
  ["INTERNAL", "API", "TOKEN"],
  ["SENTRY", "AUTH", "TOKEN"],
  ["HUBSPOT", "TOKEN"],
].map((partes) => partes.join("_"));

const VALOR_DE_EJEMPLO = /(?:example|ejemplo|placeholder|changeme|cambiar|dummy|fake|prueba|test|ci-solo|your[_-]|tu[_-]|xxx)/i;

function escaparRegExp(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pareceValorReal(valor) {
  const candidato = valor.trim();
  const entreComillas = /^(?:"[^"]*"|'[^']*'|`[^`]*`)/.exec(candidato)?.[0];
  const primero = entreComillas || candidato.split(/[\s,;}#]/, 1)[0];
  const limpio = primero.replace(/^["'`]|["'`]$/g, "");
  if (limpio.length < 12) return false;
  if (limpio.includes("${") || limpio.includes("process.env") || limpio.startsWith("$")) return false;
  if (limpio.length < 20 && /^[A-Za-z_$][\w$.]*$/.test(limpio)) return false;
  return !VALOR_DE_EJEMPLO.test(limpio);
}

export function buscarSecretosEnTexto(texto) {
  const hallazgos = [];
  const lineas = texto.split(/\r?\n/);

  for (let indice = 0; indice < lineas.length; indice += 1) {
    const linea = lineas[indice];
    for (const [tipo, patron] of PATRONES) {
      patron.lastIndex = 0;
      if (patron.test(linea)) hallazgos.push({ tipo, linea: indice + 1 });
    }

    for (const variable of VARIABLES_SENSIBLES) {
      const asignacion = new RegExp(`\\b${escaparRegExp(variable)}\\s*[:=]\\s*(.+)$`, "i").exec(linea);
      if (asignacion && pareceValorReal(asignacion[1])) {
        hallazgos.push({ tipo: `valor asignado a ${variable}`, linea: indice + 1 });
      }
    }
  }

  return hallazgos;
}

function ejecutarGit(argumentos, opciones = {}) {
  return execFileSync("git", argumentos, {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    ...opciones,
  });
}

function revisarArchivosActuales() {
  // Incluye lo ya versionado y lo nuevo que entraría en el próximo commit,
  // pero respeta .gitignore: nunca abre .env.local ni artefactos locales.
  const archivos = ejecutarGit([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]).split("\0").filter(Boolean);
  const hallazgos = [];

  for (const archivo of archivos) {
    const contenido = readFileSync(path.join(RAIZ, archivo));
    if (contenido.includes(0)) continue;
    for (const hallazgo of buscarSecretosEnTexto(contenido.toString("utf8"))) {
      hallazgos.push({ ...hallazgo, ubicacion: `${archivo}:${hallazgo.linea}` });
    }
  }

  return hallazgos;
}

function revisarHistorial() {
  const parche = ejecutarGit(["log", "--all", "-p", "--no-ext-diff", "--unified=0", "--format=commit %H"]);
  const hallazgos = [];
  let commit = "desconocido";
  let archivo = "desconocido";

  for (const linea of parche.split(/\r?\n/)) {
    if (linea.startsWith("commit ")) {
      commit = linea.slice(7, 19);
      continue;
    }
    if (linea.startsWith("+++ b/")) {
      archivo = linea.slice(6);
      continue;
    }
    if (!/^[+-]/.test(linea) || /^(?:\+\+\+|---)/.test(linea)) continue;

    for (const hallazgo of buscarSecretosEnTexto(linea.slice(1))) {
      hallazgos.push({ ...hallazgo, ubicacion: `${commit}:${archivo}` });
    }
  }

  return hallazgos;
}

function main() {
  const hallazgos = [...revisarArchivosActuales(), ...revisarHistorial()];
  if (hallazgos.length === 0) {
    console.log("Secretos: no se han detectado credenciales en archivos actuales ni en el historial.");
    return;
  }

  console.error(`Secretos: ${hallazgos.length} posible(s) credencial(es) detectada(s).`);
  for (const { tipo, ubicacion } of hallazgos) console.error(`- ${tipo} en ${ubicacion}`);
  console.error("No se muestran los valores. Revoca cualquier credencial real antes de limpiar el historial.");
  process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
