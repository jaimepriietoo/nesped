/**
 * Ritmo y montaje de la llamada de muestra.
 *
 * Vive aparte porque no depende de quién sintetice la voz: sirve igual para
 * OpenAI Realtime que para ElevenLabs. Lo que hace que una grabación suene a
 * conversación y no a clips pegados no es el timbre, son los tiempos, y esos
 * los ponemos nosotros.
 *
 * Todo trabaja sobre PCM 16 bits little-endian mono.
 */

/**
 * Recorta el silencio de los bordes de una intervención.
 *
 * El sintetizador entrega cada frase con aire por delante y por detrás. Ese
 * aire se suma a la pausa entre turnos, y así salían parones de 860 ms. En
 * una conversación española el relevo ronda los 200 ms.
 *
 * Se deja un margen para no cortar el ataque de la primera sílaba ni la
 * caída de la última, que sonaría a tijeretazo.
 */
export function recortarSilencio(pcm, frecuencia) {
  const n = pcm.length / 2;
  const ventana = Math.round(frecuencia * 0.01); // 10 ms
  const umbral = 700;                            // sobre 32768

  function primerSonido(desde, hasta, paso) {
    for (let i = desde; paso > 0 ? i < hasta : i > hasta; i += paso * ventana) {
      let pico = 0;
      for (let k = 0; k < ventana && i + k < n && i + k >= 0; k += 1) {
        pico = Math.max(pico, Math.abs(pcm.readInt16LE((i + k) * 2)));
      }
      if (pico > umbral) return i;
    }
    return paso > 0 ? desde : hasta;
  }

  const margen = Math.round(frecuencia * 0.04); // 40 ms de respiro
  const ini = Math.max(0, primerSonido(0, n, 1) - margen);
  const fin = Math.min(n, primerSonido(n - ventana, 0, -1) + ventana + margen);

  if (fin <= ini) return pcm;
  return pcm.subarray(ini * 2, fin * 2);
}

/**
 * Acorta los silencios largos que quedan DENTRO de una intervención.
 *
 * Recortar los bordes no basta: el sintetizador también se para a media
 * frase, y ahí estaba la mayoría de los parones. Medido sobre la primera
 * versión, 31 huecos para 9 intervenciones, y "Vale, el teléfono es
 * 602 297 770" tardaba 8,3 segundos en decirse.
 *
 * Se recortan sólo los que pasan del techo. Las micropausas cortas se dejan
 * a propósito: son las que hacen que suene a persona. Quitarlas todas da el
 * efecto contrario, un chorro de palabras sin respirar.
 */
export function acortarPausasInternas(pcm, frecuencia, techoMs = 260) {
  const n = pcm.length / 2;
  const ventana = Math.round(frecuencia * 0.01);
  const techo = Math.round((frecuencia * techoMs) / 1000);
  const umbral = 700;

  const trozos = [];
  let inicioSilencio = null;
  let cursor = 0;

  for (let i = 0; i + ventana <= n; i += ventana) {
    let pico = 0;
    for (let k = 0; k < ventana; k += 1) pico = Math.max(pico, Math.abs(pcm.readInt16LE((i + k) * 2)));

    if (pico < umbral) {
      if (inicioSilencio === null) inicioSilencio = i;
    } else if (inicioSilencio !== null) {
      const largo = i - inicioSilencio;
      if (largo > techo) {
        // Todo hasta donde empieza el silencio, más el silencio ya recortado.
        trozos.push(pcm.subarray(cursor * 2, (inicioSilencio + techo) * 2));
        cursor = i;
      }
      inicioSilencio = null;
    }
  }

  trozos.push(pcm.subarray(cursor * 2));
  return Buffer.concat(trozos);
}

/**
 * Hueco entre turnos.
 *
 * Ni fijo ni al azar puro. En una conversación española el relevo va de unos
 * 120 a 320 ms: se acorta cuando la respuesta es evidente —un nombre, un
 * "sí"— y se alarga cuando hay que pensar. Un hueco idéntico entre todas las
 * frases suena a metrónomo, y las personas no somos metrónomos.
 *
 * La variación es determinista: la misma escena suena igual en cada
 * generación, pero los huecos no son todos iguales entre sí.
 */
export function huecoEntreTurnos(indice, esRespuestaCorta) {
  const base = esRespuestaCorta ? 130 : 210;
  const variacion = [0, 60, -35, 90, -20, 45, 25, -45, 70][indice % 9];
  return Math.max(90, base + variacion);
}

export function silencio(ms, frecuencia) {
  return Buffer.alloc(Math.round((frecuencia * ms) / 1000) * 2);
}

export function envolverWav(pcm, frecuencia) {
  const c = Buffer.alloc(44);
  c.write("RIFF", 0); c.writeUInt32LE(36 + pcm.length, 4); c.write("WAVE", 8);
  c.write("fmt ", 12); c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(1, 22);
  c.writeUInt32LE(frecuencia, 24); c.writeUInt32LE(frecuencia * 2, 28);
  c.writeUInt16LE(2, 32); c.writeUInt16LE(16, 34);
  c.write("data", 36); c.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([c, pcm]);
}

/** Lee .env.local sin arrastrar dependencias. */
export function leerEnv(fs, ruta = ".env.local") {
  if (!fs.existsSync(ruta)) return {};
  return Object.fromEntries(
    fs.readFileSync(ruta, "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );
}

/**
 * Mide los parones de una grabación. Sin esto sólo hay opiniones.
 */
export function medirParones(pcm, frecuencia) {
  const n = pcm.length / 2;
  const ventana = Math.round(frecuencia * 0.01);
  const umbral = 700;
  const huecos = [];
  let inicio = null;
  let mudo = 0;

  for (let i = 0; i + ventana <= n; i += ventana) {
    let pico = 0;
    for (let k = 0; k < ventana; k += 1) pico = Math.max(pico, Math.abs(pcm.readInt16LE((i + k) * 2)));
    if (pico < umbral) {
      mudo += ventana;
      if (inicio === null) inicio = i;
    } else if (inicio !== null) {
      huecos.push(((i - inicio) / frecuencia) * 1000);
      inicio = null;
    }
  }

  return {
    segundos: n / frecuencia,
    silencioPorCiento: (mudo / n) * 100,
    huecoMaximoMs: huecos.length ? Math.max(...huecos) : 0,
    huecos: huecos.length,
  };
}
