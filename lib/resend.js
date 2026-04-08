import { Resend } from "resend";

let resendInstance = null;

export function getResend() {
  if (resendInstance) return resendInstance;

  if (!process.env.RESEND_API_KEY) {
    throw new Error("Falta RESEND_API_KEY");
  }

  resendInstance = new Resend(process.env.RESEND_API_KEY);
  return resendInstance;
}