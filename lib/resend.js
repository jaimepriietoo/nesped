import { Resend } from "resend";

export function getResend() {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    throw new Error("RESEND_API_KEY no configurada");
  }

  return new Resend(key);
}