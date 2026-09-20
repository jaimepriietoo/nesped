import { getTwoFactorChallenge } from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";
import { opcionesDeAutenticacion } from "@/lib/server/passkeys";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

/** El reto para firmar con la passkey. Sólo con el reto de 2FA abierto. */
async function handlePost(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const challenge = await getTwoFactorChallenge();
  if (!challenge || challenge.factorType !== "passkey") {
    return Response.json({ success: false, message: "No hay ninguna verificación pendiente." }, { status: 400 });
  }
  const limited = await requireRateLimitAsync(req, {
    namespace: "login:passkey-options", limit: 10, keyParts: [challenge.email], includeIp: false,
  });
  if (limited) return limited;
  const opciones = await opcionesDeAutenticacion({ email: challenge.email, clientId: challenge.clientId });
  if (!opciones) return Response.json({ success: false, message: "Esta cuenta no tiene passkeys." }, { status: 400 });
  return Response.json({ success: true, opciones }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = observeRoute("api.login.passkey.options.post", handlePost);
