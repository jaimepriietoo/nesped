import Link from "next/link";
import "@/components/v3/v3.css";

export default function SetupAccountClient() {
  return (
    <div className="v3 v3-auth">
      <div className="v3-auth-card">
        <h1 className="v3-auth-title">Accede a tu cuenta</h1>
        <p className="v3-auth-sub">
          Si ya has pagado, entra con la cuenta que creaste antes de contratar.
          Si utilizaste un enlace antiguo y todavía no tienes acceso, contacta con soporte para recuperar tu compra.
        </p>
        <Link className="v3-btn v3-btn--white" href="/login">Entrar</Link>
        <Link className="v3-btn" href="mailto:soporte@nesped.com">Contactar con soporte</Link>
      </div>
    </div>
  );
}
