/* =========================================================================
   Lo mínimo de WebGL2 para pintar la Apertura Neural.

   No se instala three.js. Aquí no hay escena, ni materiales, ni malla: hay
   un cuadrado a pantalla completa y un shader que marcha la geometría. Meter
   600 KB de motor 3D para renderizar un cuadrado sería pagar el peso de un
   framework para no usar nada de él, y en la portada ese peso se paga antes
   de que se vea la primera imagen.
   ========================================================================= */

export function compilar(gl, tipo, fuente) {
  const sh = gl.createShader(tipo);
  gl.shaderSource(sh, fuente);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    /* El número de línea del log es de la fuente ya montada, así que se
       adjunta numerada: sin esto, depurar un shader de 400 líneas generado
       por plantilla es adivinar. */
    const numeradas = fuente.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
    throw new Error(`Shader no compila:\n${log}\n${numeradas}`);
  }
  return sh;
}

export function programa(gl, vs, fs) {
  const p = gl.createProgram();
  const a = compilar(gl, gl.VERTEX_SHADER, vs);
  const b = compilar(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a);
  gl.attachShader(p, b);
  gl.linkProgram(p);
  gl.deleteShader(a);
  gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "";
    gl.deleteProgram(p);
    throw new Error(`Programa no enlaza: ${log}`);
  }
  return p;
}

/** Cachea las localizaciones: buscarlas por nombre en cada frame es una
    llamada al driver por uniforme y por fotograma. */
export function uniformes(gl, p) {
  const mapa = new Map();
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i += 1) {
    const info = gl.getActiveUniform(p, i);
    if (!info) continue;
    const nombre = info.name.replace(/\[0\]$/, "");
    mapa.set(nombre, gl.getUniformLocation(p, nombre));
  }
  return mapa;
}

/* Un triángulo, no dos. Cubre el viewport igual y el hardware no tiene que
   rasterizar la diagonal dos veces. */
export const VS_CUAD = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Objetivo de render fuera de pantalla.
 *
 * Se pide medio float si la extensión está: el halo necesita valores por
 * encima de 1 para que sólo brille lo que de verdad brilla. Sin extensión se
 * cae a 8 bits y el halo sale más plano, que es peor pero no roto.
 */
export function crearDestino(gl, ancho, alto, medioFloat) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const interno = medioFloat ? gl.RGBA16F : gl.RGBA8;
  const tipo = medioFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, interno, ancho, alto, 0, gl.RGBA, tipo, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { tex, fbo, ancho, alto };
}

export function borrarDestino(gl, d) {
  if (!d) return;
  gl.deleteTexture(d.tex);
  gl.deleteFramebuffer(d.fbo);
}
