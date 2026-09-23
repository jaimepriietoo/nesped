import crypto from "node:crypto";
import { logErrorSeguro } from "@/lib/server/observability.mjs";

/**
 * Cifrado de datos personales en la base (punto 1.2 del plan).
 *
 * Los teléfonos, correos, transcripciones y notas dejan de estar en claro:
 * cada columna sensible tiene una gemela `<columna>_cifrado` (AES-256-GCM
 * con una clave derivada por empresa) y, si hace falta buscar por ella,
 * una `<columna>_hash_empresa` (HMAC con clave separada por empresa). Durante
 * la transición también se conserva `<columna>_hash`, el hash global antiguo.
 * Un volcado sin la clave maestra es ilegible. Las claves derivadas separan
 * empresas, pero el borrado criptográfico independiente exige una DEK
 * aleatoria por empresa; la documentación deja ese límite explícito.
 *
 * Nada de esto lo ven las rutas: `envolverConCifrado()` intercepta el
 * cliente de Supabase y cifra al escribir, descifra al leer y reescribe los
 * filtros por columnas buscables a su hash. Se despliega por fases con
 * NESPED_CIFRADO_DATOS (ver docs/diseno-cifrado-datos-personales.md):
 *
 *   apagado  → no se toca nada (por defecto).
 *   doble    → se escribe claro y cifrado; se lee el claro.
 *   cifrado  → se escribe claro y cifrado; se lee el cifrado (y el claro si
 *              aún no hay cifrado); las búsquedas van por hash.
 *   solo     → sólo se escribe cifrado; el claro se pone a null.
 */

export const MODOS = ["apagado", "doble", "cifrado", "solo"];
export const MODOS_HASH = ["global", "doble", "empresa"];

/** Qué se cifra y por qué columnas se busca. `nombre` queda en claro a
 *  propósito: la búsqueda libre de contactos lo necesita. */
export const TABLAS = {
  leads: { cifradas: ["telefono", "email"], buscables: ["telefono", "email"] },
  calls: { cifradas: ["from_number", "phone", "transcript", "summary", "summary_long"], buscables: ["from_number", "phone"] },
  lead_notes: { cifradas: ["body"], buscables: [] },
  lead_comments: { cifradas: ["body"], buscables: [] },
  lead_memory: { cifradas: ["last_summary"], buscables: [] },
};

const PREFIJO = "v1.";
let cacheMaestra = null;

export function modoCifrado(env = process.env) {
  const modo = String(env.NESPED_CIFRADO_DATOS || "apagado").trim().toLowerCase();
  if (!MODOS.includes(modo)) throw new Error("NESPED_CIFRADO_DATOS debe ser apagado, doble, cifrado o solo");
  return modo;
}

export function modoHashBusqueda(env = process.env) {
  const modo = String(env.NESPED_HASH_BUSQUEDA || "doble").trim().toLowerCase();
  if (!MODOS_HASH.includes(modo)) {
    throw new Error("NESPED_HASH_BUSQUEDA debe ser global, doble o empresa");
  }
  return modo;
}

function claveMaestra(env = process.env) {
  if (cacheMaestra && cacheMaestra.origen === env.NESPED_DATA_ENCRYPTION_KEY) return cacheMaestra.clave;
  const valor = String(env.NESPED_DATA_ENCRYPTION_KEY || "").trim();
  let clave;
  if (/^[a-f0-9]{64}$/i.test(valor)) clave = Buffer.from(valor, "hex");
  else {
    try { clave = Buffer.from(valor, "base64"); } catch { clave = Buffer.alloc(0); }
  }
  if (clave.length !== 32) throw new Error("Configura NESPED_DATA_ENCRYPTION_KEY con 32 bytes aleatorios");
  cacheMaestra = { origen: env.NESPED_DATA_ENCRYPTION_KEY, clave };
  return clave;
}

/** Clave derivada distinta por empresa. La maestra sigue siendo necesaria. */
export function claveDeEmpresa(clientId, env = process.env) {
  if (!clientId) throw new Error("Falta la empresa para derivar su clave");
  return Buffer.from(crypto.hkdfSync("sha256", claveMaestra(env), "nesped-datos", `empresa:${clientId}`, 32));
}

function claveDeBusqueda(env = process.env) {
  return Buffer.from(crypto.hkdfSync("sha256", claveMaestra(env), "nesped-datos", "busqueda", 32));
}

function claveDeBusquedaEmpresa(clientId, env = process.env) {
  if (!clientId) throw new Error("Falta la empresa para derivar su clave de búsqueda");
  return Buffer.from(crypto.hkdfSync(
    "sha256", claveMaestra(env), "nesped-datos", `busqueda:${clientId}`, 32,
  ));
}

/** Teléfonos y correos se normalizan antes de hashear, para que "+34 600 …"
 *  y "600…" encuentren lo mismo. */
export function normalizarParaBusqueda(columna, valor) {
  const texto = String(valor ?? "").trim();
  if (columna === "email") return texto.toLowerCase();
  if (["telefono", "phone", "from_number", "to_number"].includes(columna)) {
    const digitos = texto.replace(/[^\d+]/g, "");
    return digitos.startsWith("00") ? `+${digitos.slice(2)}` : digitos;
  }
  return texto;
}

export function hashDeBusqueda(columna, valor, env = process.env) {
  const normalizado = normalizarParaBusqueda(columna, valor);
  if (!normalizado) return null;
  return crypto.createHmac("sha256", claveDeBusqueda(env)).update(`${columna}|${normalizado}`).digest("hex");
}

export function hashDeBusquedaEmpresa(columna, valor, clientId, env = process.env) {
  const normalizado = normalizarParaBusqueda(columna, valor);
  if (!normalizado) return null;
  return crypto.createHmac("sha256", claveDeBusquedaEmpresa(clientId, env))
    .update(`${columna}|${normalizado}`).digest("hex");
}

function aad(tabla, columna, clientId) {
  return Buffer.from(`${tabla}:${columna}:${clientId}`, "utf8");
}

export function cifrar({ tabla, columna, clientId, valor, env = process.env }) {
  if (valor === null || valor === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", claveDeEmpresa(clientId, env), iv);
  cipher.setAAD(aad(tabla, columna, clientId));
  const ct = Buffer.concat([cipher.update(String(valor), "utf8"), cipher.final()]);
  return `${PREFIJO}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function descifrar({ tabla, columna, clientId, sobre, env = process.env }) {
  if (sobre === null || sobre === undefined || sobre === "") return null;
  const [version, iv, tag, ct] = String(sobre).split(".");
  if (`${version}.` !== PREFIJO || !iv || !tag || !ct) throw new Error("Valor cifrado no válido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", claveDeEmpresa(clientId, env), Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(tabla, columna, clientId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/* ------------------------------------------------------------------ */
/* Transformaciones de filas                                            */
/* ------------------------------------------------------------------ */

/**
 * Prepara una fila para escribirla. Devuelve una copia con las columnas
 * cifradas y los hashes; en modo `solo`, las claras a null. Si la fila no
 * dice de qué empresa es, no se puede cifrar: en `doble` se deja pasar y se
 * registra; en `cifrado` y `solo` se lanza.
 */
export function cifrarFila({ tabla, fila, modo, clientId = fila?.client_id, env = process.env }) {
  const def = TABLAS[tabla];
  if (!def || modo === "apagado" || !fila || typeof fila !== "object") return fila;
  const columnasPresentes = def.cifradas.filter((c) => Object.prototype.hasOwnProperty.call(fila, c));
  if (!columnasPresentes.length) return fila;
  if (!clientId) {
    if (modo === "doble") {
      logErrorSeguro("cifrado.fila_sin_empresa", new Error(`Fila de ${tabla} sin client_id`), { tabla });
      return fila;
    }
    throw new Error(`No se puede cifrar una fila de ${tabla} sin client_id`);
  }
  const salida = { ...fila };
  const modoHash = modoHashBusqueda(env);
  for (const columna of columnasPresentes) {
    const valor = fila[columna];
    salida[`${columna}_cifrado`] = valor === null || valor === undefined || valor === "" ? null
      : cifrar({ tabla, columna, clientId, valor, env });
    if (def.buscables.includes(columna)) {
      salida[`${columna}_hash`] = modoHash === "empresa"
        ? null
        : hashDeBusqueda(columna, valor, env);
      if (modoHash !== "global") {
        salida[`${columna}_hash_empresa`] = hashDeBusquedaEmpresa(columna, valor, clientId, env);
      }
    }
    if (modo === "solo") salida[columna] = null;
  }
  return salida;
}

/** Lee una fila: en `cifrado` y `solo` el valor sale del sobre; si no hay
 *  sobre todavía, del claro. Quita las columnas auxiliares. */
export function descifrarFila({ tabla, fila, modo, env = process.env, quitar = [] }) {
  const def = TABLAS[tabla];
  if (!def || !fila || typeof fila !== "object") return fila;
  const salida = { ...fila };
  const clientId = fila.client_id;
  for (const columna of def.cifradas) {
    const sobre = fila[`${columna}_cifrado`];
    if ((modo === "cifrado" || modo === "solo") && sobre && clientId) {
      try {
        salida[columna] = descifrar({ tabla, columna, clientId, sobre, env });
      } catch (error) {
        logErrorSeguro("cifrado.no_se_pudo_descifrar", error, { tabla, columna });
        if (modo === "solo") salida[columna] = null;
      }
    }
    delete salida[`${columna}_cifrado`];
    if (def.buscables.includes(columna)) {
      delete salida[`${columna}_hash`];
      delete salida[`${columna}_hash_empresa`];
    }
  }
  for (const c of quitar) delete salida[c];
  return salida;
}

/**
 * Qué columnas hay que pedir de más para poder descifrar: los sobres de las
 * columnas pedidas y client_id. Devuelve el select reescrito y qué quitar
 * después. Un `*` ya lo trae todo.
 */
export function selectConSobres(tabla, seleccion, modo) {
  const def = TABLAS[tabla];
  const texto = String(seleccion ?? "*");
  if (!def || modo === "apagado" || modo === "doble" || texto.trim() === "*" || texto.includes("*")) {
    return { seleccion: texto, quitar: [] };
  }
  const pedidas = texto.split(",").map((c) => c.trim().split(":").pop().split("(")[0].trim()).filter(Boolean);
  const extra = [];
  const quitar = [];
  for (const columna of def.cifradas) {
    if (pedidas.includes(columna) && !pedidas.includes(`${columna}_cifrado`)) extra.push(`${columna}_cifrado`);
  }
  if (extra.length && !pedidas.includes("client_id")) { extra.push("client_id"); quitar.push("client_id"); }
  return { seleccion: extra.length ? `${texto},${extra.join(",")}` : texto, quitar };
}

/** Reescribe un filtro por columna buscable a su hash (sólo en cifrado/solo). */
export function filtrosCifrados(tabla, columna, valor, modo, env = process.env, clientId = null) {
  const def = TABLAS[tabla];
  if (!def || !def.buscables.includes(columna) || (modo !== "cifrado" && modo !== "solo")) {
    return [{ columna, valor }];
  }
  const modoHash = modoHashBusqueda(env);
  const transformar = (fn) => Array.isArray(valor) ? valor.map(fn) : fn(valor);
  const filtros = [];
  if (modoHash !== "empresa") {
    filtros.push({ columna: `${columna}_hash`, valor: transformar((v) => hashDeBusqueda(columna, v, env)) });
  }
  if (modoHash !== "global") {
    filtros.push({
      columna: `${columna}_hash_empresa`,
      valor: transformar((v) => hashDeBusquedaEmpresa(columna, v, clientId, env)),
    });
  }
  return filtros;
}

export function filtroCifrado(tabla, columna, valor, modo, env = process.env, clientId = null) {
  return filtrosCifrados(tabla, columna, valor, modo, env, clientId)[0];
}

/* ------------------------------------------------------------------ */
/* El envoltorio del cliente                                            */
/* ------------------------------------------------------------------ */

const METODOS_FILTRO = new Set(["eq", "neq", "in"]);
const MATERIALIZAN = new Set(["then", "catch", "finally"]);

/**
 * Un constructor de consultas que apunta las llamadas y sólo las ejecuta
 * al hacer `await`. Hace falta porque para cifrar un update hay que saber
 * la empresa, y ésa llega después, en `.eq("client_id", …)`.
 */
function constructorDiferido({ tabla, original, operacion, argumentos, modo, env }) {
  const llamadas = [];
  const materializar = () => {
    let clientId = null;
    for (const [m, args] of llamadas) {
      if (m === "eq" && args[0] === "client_id") clientId = args[1];
      if (m === "match" && args[0] && typeof args[0] === "object" && args[0].client_id) clientId = args[0].client_id;
    }
    let quitar = [];
    let b;
    if (operacion === "select") {
      const r = selectConSobres(tabla, argumentos[0], modo);
      quitar = r.quitar;
      b = original.select(r.seleccion, ...argumentos.slice(1));
    } else if (operacion === "update") {
      b = original.update(cifrarFila({ tabla, fila: argumentos[0], modo, clientId, env }), ...argumentos.slice(1));
    } else if (operacion === "insert" || operacion === "upsert") {
      const filas = argumentos[0];
      const transformadas = Array.isArray(filas)
        ? filas.map((f) => cifrarFila({ tabla, fila: f, modo, env }))
        : cifrarFila({ tabla, fila: filas, modo, env });
      b = original[operacion](transformadas, ...argumentos.slice(1));
    } else {
      b = original[operacion](...argumentos);
    }
    for (const [m, args] of llamadas) {
      if (METODOS_FILTRO.has(m) && typeof args[0] === "string") {
        const filtros = filtrosCifrados(tabla, args[0], args[1], modo, env, clientId);
        if (filtros.length === 2 && m === "eq") {
          b = b.or(filtros.map((f) => `${f.columna}.eq.${f.valor}`).join(","));
        } else if (filtros.length === 2 && m === "in") {
          b = b.or(filtros.map((f) => `${f.columna}.in.(${f.valor.join(",")})`).join(","));
        } else {
          /* `neq` mantiene el hash global durante la convivencia: combinar
             dos columnas con NULL cambiaría la semántica SQL. No hay rutas
             de negocio que usen `neq` sobre campos cifrados. */
          const f = filtros[0];
          b = b[m](f.columna, f.valor, ...args.slice(2));
        }
      } else if (m === "select" && operacion !== "select") {
        const r = selectConSobres(tabla, args[0], modo);
        quitar = r.quitar;
        b = b.select(r.seleccion, ...args.slice(1));
      } else {
        b = b[m](...args);
      }
    }
    return b.then((resultado) => {
      if (!resultado || !resultado.data) return resultado;
      const data = Array.isArray(resultado.data)
        ? resultado.data.map((fila) => descifrarFila({ tabla, fila, modo, env, quitar }))
        : descifrarFila({ tabla, fila: resultado.data, modo, env, quitar });
      return { ...resultado, data };
    });
  };
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (MATERIALIZAN.has(prop)) {
        const promesa = materializar();
        return promesa[prop].bind(promesa);
      }
      if (typeof prop === "symbol") return undefined;
      return (...args) => { llamadas.push([prop, args]); return proxy; };
    },
  });
  return proxy;
}

/**
 * Envuelve un cliente de Supabase. Las tablas del catálogo pasan por el
 * constructor diferido; el resto, tal cual. `rpc` y `storage` no se tocan.
 */
export function envolverConCifrado(supabase, { env = process.env } = {}) {
  const modo = modoCifrado(env);
  if (modo === "apagado" || !supabase) return supabase;
  return new Proxy(supabase, {
    get(objetivo, prop, receptor) {
      if (prop === "from") {
        return (tabla) => {
          const original = objetivo.from(tabla);
          if (!TABLAS[tabla]) return original;
          return new Proxy(original, {
            get(o, op) {
              if (["select", "insert", "upsert", "update", "delete"].includes(op)) {
                return (...argumentos) => constructorDiferido({ tabla, original: o, operacion: op, argumentos, modo, env });
              }
              const v = Reflect.get(o, op);
              return typeof v === "function" ? v.bind(o) : v;
            },
          });
        };
      }
      const v = Reflect.get(objetivo, prop, receptor);
      return typeof v === "function" ? v.bind(objetivo) : v;
    },
  });
}

/** Para `.or("from_number.eq.X,phone.eq.X")`, que el envoltorio no puede reescribir. */
export function condicionOr(tabla, columnas, valor, modo, env = process.env, clientId = null) {
  return columnas.flatMap((c) => filtrosCifrados(tabla, c, valor, modo, env, clientId))
    .map((f) => `${f.columna}.eq.${f.valor}`).join(",");
}

export const PARA_PRUEBAS = { PREFIJO, constructorDiferido };
