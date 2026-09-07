import { Dato, PaginaLegal } from "@/components/v3/pagina-legal";
import { EMPRESA } from "@/lib/legal";

export const metadata = {
  title: "Aviso legal",
  description: "Datos identificativos del titular de nesped.com y condiciones de uso del sitio.",
};

/**
 * Aviso legal.
 *
 * Lo exige el artículo 10 de la LSSI-CE a cualquier web que ejerza actividad
 * económica en España: hay que poder saber con quién se está tratando antes
 * de contratar nada.
 */
export default function AvisoLegal() {
  return (
    <PaginaLegal
      titulo="Aviso legal"
      actualizado="7 de septiembre de 2026"
      resumen="Quién está detrás de este sitio y bajo qué condiciones se usa."
    >
      <h2>Titular del sitio</h2>
      <dl className="v3-legal-datos">
        <Dato etiqueta="Denominación social" valor={EMPRESA.razonSocial} />
        <Dato etiqueta="NIF" valor={EMPRESA.nif} />
        <Dato etiqueta="Domicilio social" valor={EMPRESA.domicilio} />
        <Dato etiqueta="Datos registrales" valor={EMPRESA.registro} />
        <Dato etiqueta="Correo de contacto" valor={EMPRESA.correo} />
        <Dato etiqueta="Sitio web" valor={EMPRESA.web} />
      </dl>

      <h2>Objeto</h2>
      <p>
        Este aviso regula el uso de <strong>{EMPRESA.web}</strong> y de los
        servicios que se ofrecen desde él. Navegar por el sitio implica aceptar
        estas condiciones. Si no estás de acuerdo con ellas, no lo uses.
      </p>

      <h2>Uso del sitio</h2>
      <p>
        Puedes consultar el sitio libremente. No puedes utilizarlo para
        actividades ilícitas, intentar acceder a zonas restringidas, alterar su
        funcionamiento, extraer datos de forma masiva ni suplantar a terceros.
      </p>
      <p>
        La demostración por teléfono está pensada para probar el servicio con tu
        propio número. Usarla para llamar a terceros sin su consentimiento queda
        prohibido y es motivo suficiente para cortar el acceso.
      </p>

      <h2>Propiedad intelectual</h2>
      <p>
        El código, los textos, el diseño y la marca {EMPRESA.marca} pertenecen a
        su titular. La tipografía de presentación (BubbledotICG-FinePos) se usa
        bajo licencia Creative Commons BY 4.0, con la atribución que figura en
        el pie del sitio.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        El sitio se ofrece tal cual. Se pone cuidado en que la información sea
        exacta y el servicio esté disponible, pero no se garantiza que funcione
        sin interrupciones ni que esté libre de errores. Los enlaces a sitios de
        terceros se facilitan por comodidad y no implican responsabilidad sobre
        su contenido.
      </p>
      <p>
        Nada de lo anterior excluye la responsabilidad que la ley no permite
        excluir, en particular por dolo o negligencia grave.
      </p>

      <h2>Seguridad</h2>
      <p>
        Si detectas un fallo de seguridad, escríbenos a{" "}
        <a href={`mailto:${EMPRESA.correoSeguridad}`}>{EMPRESA.correoSeguridad}</a>.
        Las condiciones para reportarlo están en{" "}
        <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
      </p>

      <h2>Ley aplicable</h2>
      <p>
        Se aplica la legislación española. Para cualquier controversia, las
        partes se someten a los juzgados y tribunales del domicilio del titular,
        salvo que la ley imponga otro fuero.
      </p>
    </PaginaLegal>
  );
}
