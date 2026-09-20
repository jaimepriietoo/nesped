import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";

import { origenesPermitidos, rpIdDe } from "../../lib/server/passkeys.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const b64u = (b) => Buffer.from(b).toString("base64url");

/**
 * Un autenticador de mentira, con una clave ES256 de verdad. Firma como lo
 * haría un iPhone o una llave de hardware, sin attestation ("none"), que es
 * lo que el servidor pide. Sirve para probar el recorrido completo:
 * registro → verificación → acceso → verificación, con los mismos
 * parámetros (rpID, orígenes) que usa lib/server/passkeys.js.
 */
function autenticador(rpId) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
  const credId = crypto.randomBytes(16);
  let contador = 0;
  const rpIdHash = crypto.createHash("sha256").update(rpId).digest();

  const authData = (flags, conCredencial) => {
    const cuenta = Buffer.alloc(4); cuenta.writeUInt32BE(contador);
    const partes = [rpIdHash, Buffer.from([flags]), cuenta];
    if (conCredencial) {
      const len = Buffer.alloc(2); len.writeUInt16BE(credId.length);
      partes.push(Buffer.alloc(16), len, credId, Buffer.from(isoCBOR.encode(cose)));
    }
    return Buffer.concat(partes);
  };
  const clientData = (type, challenge, origin) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    registrar(opciones, origin) {
      const cd = clientData("webauthn.create", opciones.challenge, origin);
      const ad = authData(0x41, true); // UP + AT
      const att = isoCBOR.encode(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", ad]]));
      return {
        id: b64u(credId), rawId: b64u(credId), type: "public-key", clientExtensionResults: {},
        response: { clientDataJSON: b64u(cd), attestationObject: b64u(att), transports: ["internal"] },
      };
    },
    firmar(opciones, origin, { manipular = null } = {}) {
      contador += 1;
      const cd = clientData("webauthn.get", opciones.challenge, origin);
      const ad = authData(0x01, false); // UP
      const firma = crypto.sign("sha256", Buffer.concat([ad, crypto.createHash("sha256").update(cd).digest()]), { key: privateKey, dsaEncoding: "der" });
      const r = {
        id: b64u(credId), rawId: b64u(credId), type: "public-key", clientExtensionResults: {},
        response: { clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(firma) },
      };
      return manipular ? manipular(r) : r;
    },
    credId: b64u(credId),
  };
}

test("rpID y orígenes salen del dominio público, con y sin www", () => {
  assert.equal(rpIdDe("https://www.nesped.com"), "nesped.com");
  assert.equal(rpIdDe("https://nesped.com/algo"), "nesped.com");
  assert.deepEqual(origenesPermitidos("https://www.nesped.com"), ["https://nesped.com", "https://www.nesped.com"]);
  assert.equal(rpIdDe("basura"), "localhost");
});

test("registro y acceso completos con un autenticador ES256; otro origen, otro reto o contador repetido fallan", async () => {
  const rpID = "nesped.com";
  const origin = "https://www.nesped.com";
  const auth = autenticador(rpID);

  const regOpts = await generateRegistrationOptions({ rpName: "Nesped", rpID, userName: "ana@x.com", attestationType: "none" });
  const registro = await verifyRegistrationResponse({
    response: auth.registrar(regOpts, origin), expectedChallenge: regOpts.challenge,
    expectedOrigin: origenesPermitidos(origin), expectedRPID: rpID, requireUserVerification: false,
  });
  assert.equal(registro.verified, true);
  const credencial = registro.registrationInfo.credential;
  assert.equal(credencial.id, auth.credId);

  const verificar = (respuesta, opts) => verifyAuthenticationResponse({
    response: respuesta, expectedChallenge: opts.challenge, expectedOrigin: origenesPermitidos(origin),
    expectedRPID: rpID, requireUserVerification: false,
    credential: { id: credencial.id, publicKey: credencial.publicKey, counter: credencial.counter, transports: ["internal"] },
  });

  const authOpts = await generateAuthenticationOptions({ rpID, allowCredentials: [{ id: credencial.id }] });
  const acceso = await verificar(auth.firmar(authOpts, origin), authOpts);
  assert.equal(acceso.verified, true);
  assert.equal(acceso.authenticationInfo.newCounter, 1);

  /* Un sitio falso: misma passkey, otro origen. El navegador no lo haría,
     pero si lo hiciera, el servidor lo rechaza. */
  const opts2 = await generateAuthenticationOptions({ rpID, allowCredentials: [{ id: credencial.id }] });
  await assert.rejects(verificar(auth.firmar(opts2, "https://nesped-login.com"), opts2), /origin/i);

  /* Reto de otra sesión. */
  const opts3 = await generateAuthenticationOptions({ rpID, allowCredentials: [{ id: credencial.id }] });
  const opts4 = await generateAuthenticationOptions({ rpID, allowCredentials: [{ id: credencial.id }] });
  await assert.rejects(verificar(auth.firmar(opts3, origin), opts4), /challenge/i);

  /* Contador que no avanza: passkey clonada. La librería lo rechaza. */
  const opts5 = await generateAuthenticationOptions({ rpID, allowCredentials: [{ id: credencial.id }] });
  const firmada = auth.firmar(opts5, origin);
  await assert.rejects(verifyAuthenticationResponse({
    response: firmada, expectedChallenge: opts5.challenge, expectedOrigin: [origin], expectedRPID: rpID, requireUserVerification: false,
    credential: { id: credencial.id, publicKey: credencial.publicKey, counter: 99, transports: ["internal"] },
  }), /counter/i);
});

test("la passkey manda: el login la pide antes que TOTP y el correo, y la 2FA sólo acepta el plan B", () => {
  const login = leer("app/api/login/route.js");
  assert.match(login, /factorType: passkey \? "passkey" : totp\.enabled \? "totp" : "email"/);
  assert.match(login, /if \(passkey \|\| totp\.enabled \|\| origen\.nuevo \|\|/);
  const dosFa = leer("app/api/login/2fa/route.js");
  assert.match(dosFa, /challenge\.factorType === "passkey" && challenge\.totpEnabled === true/);
  assert.match(dosFa, /challenge\.factorType === "passkey"\s*\?\s*false/);
  assert.match(leer("app/api/login/2fa/resend/route.js"), /factorType === "passkey"/);
});

test("las rutas de passkey validan, limitan y quitar exige el código si hay TOTP", () => {
  const portal = leer("app/api/portal/passkeys/route.js");
  assert.match(portal, /leerJsonLimitado\(req, \{ maxBytes: 16 \* 1024 \}\)/);
  assert.match(portal, /requireRateLimitAsync\(req/);
  assert.match(portal, /validar\(GestionPasskeys, cuerpo\.datos\)/);
  assert.match(portal, /if \(totp\.enabled\) \{[\s\S]{0,600}verificarYConsumirTotp/);
  assert.match(portal, /passkey_added|passkey_removed/);
  const acceso = leer("app/api/login/passkey/route.js");
  assert.match(acceso, /tomarIntentoTwoFactor\(challenge\)/, "cuenta intentos como el resto de factores");
  assert.match(acceso, /challenge\.factorType !== "passkey"/);
  assert.match(acceso, /action: "passkey_verified"/);
  const modulo = leer("lib/server/passkeys.js");
  assert.match(modulo, /getSupabaseAdministrativo/);
  assert.doesNotMatch(modulo, /getSupabase\(\)/);
  assert.match(modulo, /attestationType: "none"/);
});
