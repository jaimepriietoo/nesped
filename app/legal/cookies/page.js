import { PaginaLegal } from "@/components/v3/pagina-legal";
import { COOKIES, EMPRESA } from "@/lib/legal";

export const metadata = {
  title: "Política de cookies",
  description: "Qué cookies usa Nesped y por qué no hay banner de consentimiento.",
};

/**
 * Política de cookies.
 *
 * Todas las que se dejan son estrictamente necesarias para mantener la
 * sesión, y esas están exentas de consentimiento previo. Por eso no hay
 * banner: no es un descuido, es que pedirlo para cookies técnicas es
 * incorrecto y además entrena a la gente a aceptar sin leer.
 */
export default function Cookies() {
  return (
    <PaginaLegal
      titulo="Política de cookies"
      actualizado="7 de septiembre de 2026"
      resumen="Las que dejamos, para qué sirven y por qué no verás un banner pidiéndote permiso."
    >
      <h2>Por qué no hay banner</h2>
      <p>
        Porque no hace falta. Todas las cookies de este sitio son{" "}
        <strong>técnicas y estrictamente necesarias</strong>: sirven para
        mantener tu sesión iniciada y para el segundo factor de acceso. Sin
        ellas no podrías entrar al portal.
      </p>
      <p>
        La normativa exime del consentimiento previo a este tipo de cookies.
        Poner un banner para pedirte permiso por algo que no lo necesita sólo
        acostumbra a aceptar sin leer, y no lo vamos a hacer.
      </p>
      <p>
        No usamos cookies de publicidad, de perfilado ni de medición de terceros.
        No hay píxeles de redes sociales ni herramientas de analítica que te
        sigan entre sitios.
      </p>

      <h2>Cuáles dejamos</h2>
      <table className="v3-legal-tabla">
        <thead>
          <tr><th>Cookie</th><th>Para qué</th><th>Duración</th></tr>
        </thead>
        <tbody>
          {COOKIES.map((c) => (
            <tr key={c.nombre}>
              <td><code>{c.nombre}</code></td>
              <td>{c.para}</td>
              <td>{c.duracion}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Todas van marcadas como <code>HttpOnly</code>, así que ningún script
        puede leerlas, y como <code>SameSite=Lax</code>, que impide que se
        envíen desde otro sitio web.
      </p>

      <h2>Cómo quitarlas</h2>
      <p>
        Cerrando sesión se borran todas. También puedes eliminarlas desde la
        configuración de tu navegador o bloquearlas por completo, pero entonces
        no podrás acceder al portal: sin sesión no hay forma de saber quién
        eres entre una página y la siguiente.
      </p>

      <h2>Almacenamiento local</h2>
      <p>
        La web pública no guarda nada en tu navegador más allá de la caché
        normal de imágenes y estilos. El audio de la llamada de ejemplo sólo se
        descarga si pulsas al play.
      </p>

      <h2>Dudas</h2>
      <p>
        Escríbenos a{" "}
        <a href={`mailto:${EMPRESA.correoPrivacidad}`}>{EMPRESA.correoPrivacidad}</a>.
      </p>
    </PaginaLegal>
  );
}
