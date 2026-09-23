import { verifyPasswordWithoutAccountLeak } from "@/lib/server/auth-crypto";
import { consumirCodigo } from "@/lib/server/codigos-recuperacion";
import { estadoTotp, verificarYConsumirTotp } from "@/lib/server/totp";

/**
 * Reautenticación antes de crear o eliminar una passkey.
 *
 * Una sesión válida no basta: si alguien encuentra una sesión abierta no
 * debe poder registrar su propio autenticador ni retirar el de la cuenta.
 * Se prefiere TOTP cuando está activo; en caso contrario se comprueba la
 * contraseña actual haciendo igualmente el trabajo de scrypt si falta el
 * usuario o el hash no tiene una forma válida.
 */
export async function verificarPasoAdicionalPasskey(ctx, datos, dependencias = {}) {
  const leerEstadoTotp = dependencias.estadoTotp || estadoTotp;
  const comprobarTotp = dependencias.verificarYConsumirTotp || verificarYConsumirTotp;
  const comprobarRecuperacion = dependencias.consumirCodigo || consumirCodigo;
  const totp = await leerEstadoTotp({ email: ctx.userEmail, clientId: ctx.clientId });

  if (totp.enabled) {
    const code = datos.code || "";
    const valido = /^\d{6}$/.test(code)
      ? await comprobarTotp({ email: ctx.userEmail, clientId: ctx.clientId, codigo: code })
      : code ? await comprobarRecuperacion({ email: ctx.userEmail, codigo: code }) : false;
    return { valido, tipo: "codigo" };
  }

  const { data: user, error } = await ctx.supabase.from("users")
    .select("password,password_hash")
    .eq("email", ctx.userEmail).eq("client_id", ctx.clientId).maybeSingle();
  const hash = user?.password || user?.password_hash || "";
  return {
    valido: !error && verifyPasswordWithoutAccountLeak(datos.password || "", hash),
    tipo: "password",
  };
}
