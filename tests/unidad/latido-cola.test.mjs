import { test } from "node:test";
import assert from "node:assert/strict";
import latido from "@/lib/server/latido-cola.cjs";

const { empezarLatido } = latido;

/**
 * El latido es lo que hace que la cola avance. Si se para, no se para nada
 * ruidosamente: simplemente los informes dejan de salir y el archivado deja de
 * avanzar, sin ningún error en ninguna parte.
 *
 * Por eso lo que se prueba aquí es sobre todo que NO se rompe: que un endpoint
 * caído, lento o que contesta basura no tumba el servidor de voz, que es lo
 * que atiende las llamadas de verdad.
 */

const silencio = { warn: () => {}, log: () => {} };

function conFetchFalso(implementacion, prueba) {
  const original = globalThis.fetch;
  globalThis.fetch = implementacion;
  return Promise.resolve(prueba()).finally(() => {
    globalThis.fetch = original;
  });
}

test("sin dirección o sin token no late, y lo dice", () => {
  const avisos = [];
  const log = { warn: (m) => avisos.push(m), log: () => {} };

  assert.equal(empezarLatido({ baseUrl: "", token: "t", log }).apagado, true);
  assert.equal(empezarLatido({ baseUrl: "https://x", token: "", log }).apagado, true);
  assert.equal(avisos.length, 2, "un latido apagado en silencio es peor que uno roto");
});

test("llama al endpoint de la cola con el token interno", async () => {
  let recibido = null;
  await conFetchFalso(
    async (url, opciones) => {
      recibido = { url, opciones };
      return { ok: true, json: async () => ({ cogidos: 0 }) };
    },
    async () => {
      const { latir, parar } = empezarLatido({
        baseUrl: "https://nesped.com/",
        token: "secreto",
        log: silencio,
      });
      await latir();
      parar();
    }
  );

  assert.equal(recibido.url, "https://nesped.com/api/cola/procesar");
  assert.equal(recibido.opciones.method, "POST");
  assert.equal(recibido.opciones.headers["x-nesped-internal-token"], "secreto");
});

test("un endpoint caído no lanza: el servidor de voz sigue atendiendo", async () => {
  /* Este módulo vive dentro del proceso que coge las llamadas. Si una
     excepción suya subiera hasta arriba, una caída del portal se llevaría por
     delante el teléfono, que es el producto. */
  await conFetchFalso(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      const { latir, parar } = empezarLatido({
        baseUrl: "https://nesped.com",
        token: "t",
        log: silencio,
      });
      await latir();
      parar();
    }
  );
});

test("una respuesta que no es JSON tampoco lanza", async () => {
  await conFetchFalso(
    async () => ({
      ok: true,
      json: async () => {
        throw new Error("no era JSON");
      },
    }),
    async () => {
      const { latir, parar } = empezarLatido({
        baseUrl: "https://nesped.com",
        token: "t",
        log: silencio,
      });
      await latir();
      parar();
    }
  );
});

test("no se apilan latidos: si el anterior sigue en vuelo, el nuevo se salta", async () => {
  /* Un endpoint lento con un latido cada treinta segundos acabaría con veinte
     peticiones abiertas a la vez contra un servicio que ya va justo. */
  let llamadas = 0;
  let soltar;
  const enEspera = new Promise((r) => (soltar = r));

  await conFetchFalso(
    async () => {
      llamadas += 1;
      await enEspera;
      return { ok: true, json: async () => ({ cogidos: 0 }) };
    },
    async () => {
      const { latir, parar } = empezarLatido({
        baseUrl: "https://nesped.com",
        token: "t",
        log: silencio,
      });

      const primero = latir();
      await latir();
      await latir();

      assert.equal(llamadas, 1, "sólo el primero debería estar en vuelo");
      soltar();
      await primero;
      parar();
    }
  );
});

test("después de parar no vuelve a llamar", async () => {
  let llamadas = 0;
  await conFetchFalso(
    async () => {
      llamadas += 1;
      return { ok: true, json: async () => ({ cogidos: 0 }) };
    },
    async () => {
      const { latir, parar } = empezarLatido({
        baseUrl: "https://nesped.com",
        token: "t",
        log: silencio,
      });
      parar();
      await latir();
      assert.equal(llamadas, 0);
    }
  );
});
