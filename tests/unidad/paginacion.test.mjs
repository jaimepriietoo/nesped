import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { cursorDe, leerCursor, cuantasFilas, paginar, CursorInvalido } from "@/lib/server/paginacion";

/**
 * Paginar por cursor.
 *
 * Que el cursor vaya y vuelva sin perder microsegundos, que uno manipulado
 * no llegue nunca a la consulta, y que la consulta que sale lleve el filtro
 * de "después de esta fila", el orden con desempate y una fila de más para
 * saber si hay otra página.
 */

const FILA = { id: "a0000000-0000-4000-8000-000000000001", created_at: "2026-09-15T10:00:00.123456+00:00" };

test("el cursor va y vuelve entero, microsegundos incluidos", () => {
  const c = cursorDe(FILA);
  assert.match(c, /^[A-Za-z0-9_-]+$/, "opaco y apto para una URL");
  assert.deepEqual(leerCursor(c), { t: FILA.created_at, i: FILA.id });
  assert.equal(leerCursor(""), null);
  assert.equal(cursorDe({}), null);
});

test("un cursor manipulado no llega a la consulta", () => {
  const malos = [
    "no-es-base64-válido!!",
    Buffer.from("[]").toString("base64url"),
    Buffer.from(JSON.stringify({ t: "ayer", i: "x" })).toString("base64url"),
    /* Una coma o un paréntesis dentro cambiarían el filtro .or() de PostgREST. */
    Buffer.from(JSON.stringify({ t: FILA.created_at, i: "x),client_id.neq.otra" })).toString("base64url"),
    Buffer.from(JSON.stringify({ t: `${FILA.created_at},id.gt.0`, i: FILA.id })).toString("base64url"),
  ];
  for (const m of malos) assert.throws(() => leerCursor(m), CursorInvalido, m);
});

test("cuántas filas: lo pedido, entre 1 y el máximo", () => {
  assert.equal(cuantasFilas(null), 100);
  assert.equal(cuantasFilas("abc"), 100);
  assert.equal(cuantasFilas("0"), 100);
  assert.equal(cuantasFilas("40"), 40);
  assert.equal(cuantasFilas("99999"), 500);
});

/** Un cliente que no sale a la red: contesta lo que se le diga y guarda la URL. */
function clienteFalso(filas) {
  const pedidas = [];
  const supabase = createClient("https://sin-salida.supabase.co", "clave", {
    global: {
      fetch: async (url) => {
        pedidas.push(new URL(String(url)));
        return new Response(JSON.stringify(filas), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  });
  return { supabase, pedidas };
}

test("la consulta lleva el filtro del cursor, el orden con desempate y una fila de más", async () => {
  const filas = Array.from({ length: 3 }, (_, k) => ({ id: `b000000${k}`, created_at: `2026-09-1${k}T00:00:00+00:00` }));
  const { supabase, pedidas } = clienteFalso(filas);

  const pagina = await paginar(supabase.from("leads").select("*").eq("client_id", "acme"), { cursor: cursorDe(FILA), cuantos: 2 });

  const p = pedidas[0].searchParams;
  assert.equal(p.get("client_id"), "eq.acme", "el filtro de empresa que ya llevaba sigue ahí");
  assert.equal(p.get("or"), `(created_at.lt.${FILA.created_at},and(created_at.eq.${FILA.created_at},id.lt.${FILA.id}))`);
  assert.equal(p.get("order"), "created_at.desc,id.desc");
  assert.equal(p.get("limit"), "3", "cuantos + 1 para saber si hay más");
  assert.equal(pagina.filas.length, 2);
  assert.equal(pagina.siguiente, cursorDe(filas[1]), "el cursor apunta a la última fila entregada");
});

test("sin cursor empieza por el principio; sin fila de más, es la última página", async () => {
  const { supabase, pedidas } = clienteFalso([{ id: "c1", created_at: "2026-09-15T00:00:00+00:00" }]);
  const pagina = await paginar(supabase.from("calls").select("*"), { cuantos: 50 });
  assert.equal(pedidas[0].searchParams.get("or"), null);
  assert.equal(pagina.filas.length, 1);
  assert.equal(pagina.siguiente, null);
});
