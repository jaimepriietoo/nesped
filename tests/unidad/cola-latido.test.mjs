import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * Lo que tiene que seguir siendo cierto al cambiar quién empuja la cola.
 *
 * Durante la transición laten dos a la vez, Supabase Cron y Railway, y el
 * cron diario de Vercel por detrás. La ruta tiene que aceptar a los tres, y
 * sólo a ellos, y dos pasadas simultáneas no pueden hacer dos veces el mismo
 * trabajo.
 *
 * Se ejecuta la ruta de verdad contra un PostgREST falso en memoria. El
 * reparto sin carreras lo garantiza Postgres (`for update skip locked` en
 * tomar_trabajos, una sola sentencia); el doble lo imita haciendo el reparto
 * de una vez, sin esperas en medio. Lo que se prueba aquí es que la ruta no
 * ejecuta nada que no le haya dado ese reparto, y que cada trabajo se cierra
 * una sola vez.
 */

const INTERNO = "i".repeat(48);
const CRON = "c".repeat(48);

process.env.SUPABASE_URL = "http://supabase.falso";
process.env.SUPABASE_SERVICE_ROLE_KEY = "s".repeat(48);
process.env.NESPED_SESSION_SECRET = "n".repeat(48);
process.env.INTERNAL_API_TOKEN = INTERNO;
process.env.CRON_SECRET = CRON;

/* ── Un PostgREST mínimo: lo que la ruta y la cola piden, nada más. ── */

let filas = [];
let cierres = [];
let siguienteId = 1;

function nuevoTrabajo(datos = {}) {
  const fila = {
    id: siguienteId++,
    tipo: "tipo_que_nadie_sabe_hacer",
    client_id: null,
    datos: {},
    clave_unica: null,
    estado: "pendiente",
    intentos: 0,
    no_antes_de: new Date(Date.now() - 1000).toISOString(),
    creado_en: new Date().toISOString(),
    trabajador: null,
    tomado_en: null,
    ...datos,
  };
  filas.push(fila);
  return fila;
}

const json = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(String(entrada));
  const metodo = (opciones.method || "GET").toUpperCase();
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  const ruta = url.pathname.replace(/^\/rest\/v1\//, "");
  const quiereObjeto = /vnd\.pgrst\.object/.test(new Headers(opciones.headers).get("accept") || "");

  /* Un respiro antes de contestar, para que dos pasadas se crucen de
     verdad en el tiempo. */
  await new Promise((r) => setTimeout(r, Math.random() * 5));

  if (ruta === "ajustes_plataforma") return json(quiereObjeto ? null : []);
  if (ruta === "rpc/rescatar_trabajos_colgados") return json(0);
  if (ruta === "rpc/purgar_seguridad_caducada") return json(null);

  if (ruta === "rpc/tomar_trabajos") {
    /* Como la sentencia de Postgres: todo de una vez, sin await en medio. */
    const ahora = Date.now();
    const libres = filas
      .filter((f) => f.estado === "pendiente" && new Date(f.no_antes_de).getTime() <= ahora)
      .slice(0, cuerpo.p_cuantos);
    for (const f of libres) {
      f.estado = "en_curso";
      f.intentos += 1;
      f.trabajador = cuerpo.p_trabajador;
      f.tomado_en = new Date().toISOString();
    }
    return json(libres.map((f) => ({ ...f })));
  }

  if (ruta === "trabajos" && metodo === "GET") {
    const clave = url.searchParams.get("clave_unica")?.replace(/^eq\./, "");
    /* El mantenimiento del día y el barrido de este cuarto de hora ya
       estaban: así la pasada sólo coge los trabajos de la prueba. */
    if (clave) return json(/^(mantenimiento|automatismos_barrido):/.test(clave) ? [{ id: 0 }] : []);
    return json([]);
  }

  if (ruta === "trabajos" && metodo === "POST") {
    const fila = nuevoTrabajo(cuerpo);
    return json(quiereObjeto ? { id: fila.id } : [{ id: fila.id }], 201);
  }

  if (ruta === "trabajos" && metodo === "PATCH") {
    const id = Number(url.searchParams.get("id")?.replace(/^eq\./, ""));
    const fila = filas.find((f) => f.id === id);
    Object.assign(fila, cuerpo);
    cierres.push({ id, estado: cuerpo.estado });
    return json(null, 204);
  }

  return json({ message: `ruta no prevista en el doble: ${metodo} ${ruta}` }, 404);
};

const { POST, GET } = await import("@/app/api/cola/procesar/route.js");
const { requireInternalRequest, isAuthorizedColaRequest } = await import("@/lib/server/internal-api");
const { fallar, tomarTrabajos } = await import("@/lib/server/cola");

beforeEach(() => {
  filas = [];
  cierres = [];
  siguienteId = 1;
  process.env.INTERNAL_API_TOKEN = INTERNO;
  process.env.CRON_SECRET = CRON;
});

const peticion = (cabeceras = {}, url = "https://www.nesped.com/api/cola/procesar") =>
  new Request(url, { method: "POST", headers: cabeceras });

/* ── Quién puede empujar la cola ── */

test("sin autenticación, 401 y la cola ni se mira", async () => {
  nuevoTrabajo();
  const respuesta = await POST(peticion());

  assert.equal(respuesta.status, 401);
  assert.equal(filas[0].estado, "pendiente");
});

test("con un token equivocado, 401", async () => {
  for (const cabeceras of [
    { authorization: `Bearer ${"x".repeat(48)}` },
    { "x-nesped-internal-token": "x".repeat(48) },
    { authorization: `Bearer ${CRON.slice(0, -1)}` },
    { authorization: CRON }, // sin "Bearer "
  ]) {
    assert.equal((await POST(peticion(cabeceras))).status, 401, JSON.stringify(Object.keys(cabeceras)));
  }
});

test("el secreto en la URL no vale", async () => {
  for (const url of [
    `https://www.nesped.com/api/cola/procesar?token=${CRON}`,
    `https://www.nesped.com/api/cola/procesar?secret=${CRON}`,
    `https://www.nesped.com/api/cola/procesar?authorization=Bearer%20${CRON}`,
    `https://www.nesped.com/api/cola/procesar?x-nesped-internal-token=${INTERNO}`,
  ]) {
    assert.equal((await POST(peticion({}, url))).status, 401);
  }
});

test("entra el latido de Supabase (Bearer CRON_SECRET), por POST", async () => {
  const respuesta = await POST(peticion({ authorization: `Bearer ${CRON}`, "content-type": "application/json" }));
  assert.equal(respuesta.status, 200);
});

test("entra el cron diario de Vercel (GET con Bearer CRON_SECRET)", async () => {
  const respuesta = await GET(new Request("https://www.nesped.com/api/cola/procesar", {
    headers: { authorization: `Bearer ${CRON}` },
  }));
  assert.equal(respuesta.status, 200);
});

test("sigue entrando Railway (token interno), que es el respaldo", async () => {
  assert.equal((await POST(peticion({ "x-nesped-internal-token": INTERNO }))).status, 200);
  assert.equal((await POST(peticion({ authorization: `Bearer ${INTERNO}` }))).status, 200);
});

test("CRON_SECRET sólo abre la cola: el resto de rutas internas lo rechazan", () => {
  /* Si el secreto se filtra desde la base de datos, no puede servir para
     escribir contactos ni leer el contexto de una llamada. */
  assert.notEqual(requireInternalRequest(peticion({ authorization: `Bearer ${CRON}` })), null);
  assert.equal(requireInternalRequest(peticion({ authorization: `Bearer ${INTERNO}` })), null);
});

test("un CRON_SECRET flojo o reutilizado falla cerrado", () => {
  const conCron = () => peticion({ authorization: `Bearer ${process.env.CRON_SECRET}` });

  process.env.CRON_SECRET = "corto";
  assert.equal(isAuthorizedColaRequest(conCron()), false, "menos de 32 caracteres");

  process.env.CRON_SECRET = "";
  assert.equal(isAuthorizedColaRequest(peticion({ authorization: "Bearer " })), false, "vacío");

  process.env.CRON_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(isAuthorizedColaRequest(conCron()), false, "igual que la clave de servicio");

  process.env.CRON_SECRET = process.env.NESPED_SESSION_SECRET;
  assert.equal(isAuthorizedColaRequest(conCron()), false, "igual que el secreto de sesión");
});

test("la respuesta nunca devuelve el secreto", async () => {
  const texto = await (await POST(peticion({ authorization: `Bearer ${CRON}` }))).text();
  assert.equal(texto.includes(CRON), false);
  const rechazo = await (await POST(peticion({ authorization: `Bearer ${"x".repeat(48)}` }))).text();
  assert.equal(rechazo.includes("x".repeat(48)), false);
});

/* ── Dos latidos a la vez ── */

test("dos pasadas simultáneas no procesan dos veces el mismo trabajo", async () => {
  for (let i = 0; i < 25; i += 1) nuevoTrabajo();

  /* Supabase y Railway en el mismo instante, dos veces seguidas. */
  const respuestas = await Promise.all([
    POST(peticion({ authorization: `Bearer ${CRON}` })),
    POST(peticion({ "x-nesped-internal-token": INTERNO })),
    POST(peticion({ authorization: `Bearer ${CRON}` })),
    POST(peticion({ "x-nesped-internal-token": INTERNO })),
  ]);
  const cuerpos = await Promise.all(respuestas.map((r) => r.json()));

  const cogidos = cuerpos.reduce((suma, c) => suma + c.cogidos, 0);
  assert.equal(cogidos, 25, "entre todas se reparten los 25, ni uno más");

  const porTrabajo = new Map();
  for (const { id } of cierres) porTrabajo.set(id, (porTrabajo.get(id) || 0) + 1);
  assert.equal(porTrabajo.size, 25);
  for (const [id, veces] of porTrabajo) assert.equal(veces, 1, `el trabajo ${id} se cerró ${veces} veces`);
  for (const fila of filas) assert.equal(fila.intentos, 1, `el trabajo ${fila.id} se cogió ${fila.intentos} veces`);
});

/* ── Un fallo pasajero ── */

test("un fallo temporal queda pendiente y la siguiente pasada lo reintenta", async () => {
  nuevoTrabajo({ tipo: "informe_diario" });

  const [cogido] = await tomarTrabajos({ cuantos: 10, trabajador: "prueba" });
  const resultado = await fallar(cogido, new Error("el proveedor de correo tarda"));

  assert.equal(resultado.reintenta, true);
  assert.equal(filas[0].estado, "pendiente", "no se da por perdido");
  assert.equal(filas[0].trabajador, null);
  assert.ok(new Date(filas[0].no_antes_de) > new Date(), "espera antes de reintentar");

  /* Antes de la espera, la pasada no lo coge: no martillea al proveedor. */
  assert.deepEqual(await tomarTrabajos({ cuantos: 10, trabajador: "prueba" }), []);

  /* Pasada la espera, sí. */
  filas[0].no_antes_de = new Date(Date.now() - 1000).toISOString();
  const [otraVez] = await tomarTrabajos({ cuantos: 10, trabajador: "prueba" });
  assert.equal(otraVez.id, cogido.id);
  assert.equal(otraVez.intentos, 2);
});
