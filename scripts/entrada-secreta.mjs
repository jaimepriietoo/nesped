import readline from "node:readline/promises";
import * as readlineTty from "node:readline";

/**
 * Lee un valor sin reflejarlo en una terminal interactiva. En pipes conserva
 * el comportamiento normal, necesario para automatización local controlada.
 */
export async function preguntarSecreto(pregunta, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    const rl = readline.createInterface({ input, output });
    try {
      return await rl.question(pregunta);
    } finally {
      rl.close();
    }
  }

  output.write(pregunta);
  readlineTty.emitKeypressEvents(input);
  const estabaEnRaw = Boolean(input.isRaw);
  const estabaPausada = typeof input.isPaused === "function" && input.isPaused();
  input.setRawMode(true);
  input.resume?.();

  return await new Promise((resolve, reject) => {
    let valor = "";
    let terminado = false;

    const limpiar = () => {
      if (terminado) return;
      terminado = true;
      input.off("keypress", alPulsar);
      input.off("error", alFallar);
      input.off("end", alTerminarEntrada);
      input.setRawMode(estabaEnRaw);
      if (estabaPausada) input.pause?.();
      output.write("\n");
    };
    const completar = () => {
      limpiar();
      resolve(valor);
    };
    const fallar = (error) => {
      limpiar();
      reject(error);
    };
    const alFallar = (error) => fallar(error);
    const alTerminarEntrada = () => fallar(new Error("La entrada terminó antes de recibir el secreto"));
    const alPulsar = (texto, tecla = {}) => {
      if (tecla.ctrl && tecla.name === "c") {
        const error = new Error("Entrada cancelada");
        error.code = "NESPED_INPUT_CANCELLED";
        fallar(error);
        return;
      }
      if (tecla.name === "return" || tecla.name === "enter") {
        completar();
        return;
      }
      if (tecla.name === "backspace" || tecla.name === "delete") {
        valor = Array.from(valor).slice(0, -1).join("");
        return;
      }
      if (tecla.ctrl || tecla.meta || !texto || /[\u0000-\u001f\u007f]/u.test(texto)) return;
      valor += texto;
    };

    input.on("keypress", alPulsar);
    input.once("error", alFallar);
    input.once("end", alTerminarEntrada);
  });
}
