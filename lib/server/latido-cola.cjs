/**
 * El latido que mueve la cola.
 *
 * LO QUE RESUELVE
 *
 * La cola de trabajos la ejecuta /api/cola/procesar, y hasta ahora quien la
 * llamaba era el cron de Vercel. Eso ata el ritmo del producto al plan
 * contratado: en el plan Hobby los cron corren UNA VEZ AL DÍA. Un informe
 * pedido a las nueve de la mañana saldría al día siguiente, y el archivado
 * avanzaría un lote cada veinticuatro horas.
 *
 * Aquí hay un proceso que ya corre todo el rato —el servidor de voz— y que
 * puede llamar cada medio minuto sin coste ninguno: es una petición HTTP a un
 * endpoint que casi siempre contesta "nada que hacer".
 *
 * LO QUE NO RESUELVE, Y CONVIENE SABERLO
 *
 * Esto separa QUIÉN DA LA ORDEN, no QUIÉN HACE EL TRABAJO. Los trabajos se
 * siguen ejecutando dentro de funciones de Vercel, con su límite de tiempo y
 * facturadas por invocación. Es suficiente hoy porque cada trabajo se corta
 * solo a los veinte segundos y se vuelve a encolar, así que ninguno necesita
 * más tiempo del que hay.
 *
 * El día que la cola mueva volumen de verdad, el paso siguiente es ejecutar
 * los trabajos aquí en vez de llamar por HTTP. Eso obliga a que este proceso
 * pueda cargar los módulos de la aplicación, que hoy usan el alias `@/` de
 * Next, y por eso no se hace ahora: no vale la pena tener dos copias del mismo
 * código en dos runtimes para ahorrar unas invocaciones que aún no duelen.
 *
 * SOBRE VARIAS INSTANCIAS
 *
 * Si hay dos servidores de voz, los dos laten, y no pasa nada: el reparto lo
 * hace Postgres con `for update skip locked` y cada uno se lleva trabajos
 * distintos. Duplicar el latido no duplica el trabajo.
 */

/** Cada cuánto se pregunta si hay algo que hacer. */
const CADA_MS = Number(process.env.LATIDO_COLA_MS || 30_000);

/**
 * Cuánto se espera antes del primer latido.
 *
 * Al arrancar, el servidor de voz tiene cosas mejores que hacer que disparar
 * trabajos de fondo, y un despliegue nuevo puede tardar un momento en estar
 * listo del otro lado.
 */
const ESPERA_INICIAL_MS = 20_000;

function empezarLatido({ baseUrl, token, log = console }) {
  if (!baseUrl || !token) {
    log.warn?.(
      "Latido de la cola apagado: falta NEXT_PUBLIC_APP_URL o INTERNAL_API_TOKEN"
    );
    return { parar: () => {}, latir: async () => {}, apagado: true };
  }

  const url = `${String(baseUrl).replace(/\/+$/, "")}/api/cola/procesar`;
  let enMarcha = false;
  let parado = false;

  async function latir() {
    /* Si el latido anterior sigue en vuelo no se lanza otro. Un endpoint lento
       no puede convertirse en peticiones apiladas. */
    if (enMarcha || parado) return;
    enMarcha = true;

    try {
      const respuesta = await fetch(url, {
        method: "POST",
        headers: { "x-nesped-internal-token": token },
        /* Con techo: si el otro lado se cuelga, este latido se corta y el
           siguiente lo intenta de nuevo. */
        signal: AbortSignal.timeout(55_000),
      });

      if (!respuesta.ok) {
        log.warn?.(`Latido de la cola: ${respuesta.status}`);
        return;
      }

      const datos = await respuesta.json().catch(() => null);

      /* Sólo se dice algo cuando ha pasado algo. Un registro con una línea
         cada treinta segundos diciendo "nada" no lo lee nadie y esconde las
         que sí importan. */
      if (datos?.cogidos > 0 || datos?.rescatados > 0) {
        log.log?.(
          `Cola: ${datos.hechos} hechos, ${datos.fallidos?.length || 0} fallidos` +
            (datos.rescatados ? `, ${datos.rescatados} rescatados` : "")
        );
      }
    } catch (err) {
      /* Que la cola no arranque no puede tumbar el servidor de voz. Se anota
         y se vuelve a intentar dentro de medio minuto. */
      log.warn?.(`Latido de la cola falló: ${err?.message || err}`);
    } finally {
      enMarcha = false;
    }
  }

  const arranque = setTimeout(() => {
    latir();
    const intervalo = setInterval(latir, CADA_MS);
    intervalo.unref?.();
  }, ESPERA_INICIAL_MS);

  /* unref para que este temporizador no impida que el proceso termine cuando
     Railway le pide que se vaya. */
  arranque.unref?.();

  /* Se devuelve `latir` además de `parar` para poder dispararlo desde una
     prueba sin esperar veinte segundos a que salte el temporizador. */
  return {
    latir,
    apagado: false,
    parar: () => {
      parado = true;
      clearTimeout(arranque);
    },
  };
}

module.exports = { empezarLatido, CADA_MS, ESPERA_INICIAL_MS };
