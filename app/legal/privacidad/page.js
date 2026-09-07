import { Dato, PaginaLegal } from "@/components/v3/pagina-legal";
import { EMPRESA, ENCARGADOS } from "@/lib/legal";
import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";

export const metadata = {
  title: "Política de privacidad",
  description: "Qué datos trata Nesped, para qué, durante cuánto tiempo y qué derechos tienes.",
};

/**
 * Política de privacidad.
 *
 * Los plazos de conservación se leen de la configuración real del producto,
 * no se escriben aquí a mano: si mañana se cambia la retención de las
 * grabaciones, este texto lo dice solo. Un plazo escrito en la política que
 * no coincide con el del sistema es una infracción, no una errata.
 */
export default function Privacidad() {
  const politica = getVoiceCompliancePolicy();

  return (
    <PaginaLegal
      titulo="Política de privacidad"
      actualizado="7 de septiembre de 2026"
      resumen="Qué datos tratamos, por qué podemos hacerlo, cuánto los guardamos y cómo ejercer tus derechos."
    >
      <h2>Quién trata tus datos</h2>
      <dl className="v3-legal-datos">
        <Dato etiqueta="Responsable" valor={EMPRESA.razonSocial} />
        <Dato etiqueta="NIF" valor={EMPRESA.nif} />
        <Dato etiqueta="Domicilio" valor={EMPRESA.domicilio} />
        <Dato etiqueta="Contacto de privacidad" valor={EMPRESA.correoPrivacidad} />
      </dl>

      <h2>Dos situaciones distintas</h2>
      <p>
        Conviene separarlas porque el papel de {EMPRESA.marca} no es el mismo:
      </p>
      <ul>
        <li>
          <strong>Eres cliente de {EMPRESA.marca}.</strong> Tratamos tus datos
          como responsables: los de tu cuenta, tu facturación y tu uso del
          portal.
        </li>
        <li>
          <strong>Llamas al número de un cliente nuestro.</strong> Ahí el
          responsable es esa empresa, no nosotros. {EMPRESA.marca} actúa como
          encargado del tratamiento y sólo hace lo que esa empresa le indica.
          Para ejercer tus derechos, dirígete a ella; si no sabes cómo, escribe
          a <a href={`mailto:${EMPRESA.correoPrivacidad}`}>{EMPRESA.correoPrivacidad}</a> y
          te decimos con quién hablar.
        </li>
      </ul>

      <h2>Qué datos tratamos y por qué</h2>
      <table className="v3-legal-tabla">
        <thead>
          <tr><th>Datos</th><th>Para qué</th><th>Base legal</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Correo, contraseña, rol y teléfono de acceso</td>
            <td>Darte acceso al portal y verificar quién entra</td>
            <td>Ejecución del contrato</td>
          </tr>
          <tr>
            <td>Datos de facturación y pagos</td>
            <td>Cobrar la suscripción y cumplir obligaciones fiscales</td>
            <td>Contrato y obligación legal</td>
          </tr>
          <tr>
            <td>Grabación y transcripción de llamadas</td>
            <td>Calidad del servicio, seguimiento comercial y prueba de lo acordado</td>
            <td>Interés legítimo, con aviso previo en cada llamada</td>
          </tr>
          <tr>
            <td>Nombre, teléfono y necesidad de quien llama</td>
            <td>Registrar el contacto para que la empresa le devuelva la llamada</td>
            <td>Interés legítimo de la empresa que recibe la llamada</td>
          </tr>
          <tr>
            <td>Registros técnicos y de acceso</td>
            <td>Seguridad, detección de abusos y diagnóstico de errores</td>
            <td>Interés legítimo</td>
          </tr>
        </tbody>
      </table>

      <h2>Grabación de llamadas</h2>
      <p>
        Antes de que el agente empiece a hablar se avisa de que la llamada la
        atiende una inteligencia artificial y de que se graba. Quien llama puede
        pedir otra vía de contacto en cualquier momento y no se insiste.
      </p>
      <p>
        Las grabaciones se conservan{" "}
        <strong>{politica.recordingRetentionDays} días</strong> y las
        transcripciones <strong>{politica.transcriptRetentionDays} días</strong>.
        Pasado ese plazo se borran de forma automática.
      </p>

      <h2>Cuánto tiempo guardamos cada cosa</h2>
      <ul>
        <li><strong>Cuenta y acceso:</strong> mientras el contrato esté vigente y un año después.</li>
        <li><strong>Facturación:</strong> seis años, por obligación mercantil y fiscal.</li>
        <li><strong>Grabaciones:</strong> {politica.recordingRetentionDays} días.</li>
        <li><strong>Transcripciones y contactos captados:</strong> {politica.transcriptRetentionDays} días, salvo que la empresa cliente los conserve en su propio sistema.</li>
        <li><strong>Registros técnicos:</strong> hasta noventa días.</li>
      </ul>

      <h2>Con quién compartimos datos</h2>
      <p>
        No vendemos datos ni los cedemos con fines publicitarios. Sí trabajamos
        con proveedores que los tratan por cuenta nuestra, con contrato de
        encargado y las garantías que exige el Reglamento. Los marcados fuera
        del Espacio Económico Europeo operan bajo cláusulas contractuales tipo
        de la Comisión Europea.
      </p>
      <table className="v3-legal-tabla">
        <thead>
          <tr><th>Proveedor</th><th>Para qué</th><th>Dónde</th></tr>
        </thead>
        <tbody>
          {ENCARGADOS.map((e) => (
            <tr key={e.nombre}>
              <td><strong>{e.nombre}</strong></td>
              <td>{e.para}</td>
              <td>
                {e.donde}{" "}
                {e.fuera ? <span className="v3-legal-fuera">fuera del EEE</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Decisiones automatizadas</h2>
      <p>
        El sistema puntúa los contactos y propone un siguiente paso, pero no
        toma ninguna decisión con efectos jurídicos ni deniega nada por sí solo:
        quien decide es siempre una persona de la empresa. La voz tampoco
        confirma precios, plazos ni disponibilidad.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir acceso a tus datos, su rectificación o supresión, limitar u
        oponerte al tratamiento, y solicitar su portabilidad. Escribe a{" "}
        <a href={`mailto:${EMPRESA.correoPrivacidad}`}>{EMPRESA.correoPrivacidad}</a>{" "}
        indicando qué quieres ejercer. Respondemos en un mes.
      </p>
      <p>
        Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante
        la <a href="https://www.aepd.es" target="_blank" rel="noreferrer noopener">Agencia
        Española de Protección de Datos</a>.
      </p>

      <h2>Seguridad</h2>
      <p>
        Las contraseñas se guardan con derivación scrypt, nunca en claro. Las
        cuentas con permisos elevados exigen verificación en dos pasos. El
        tráfico va cifrado, las sesiones van firmadas y el acceso a los datos de
        cada cliente está aislado del resto. Puedes avisarnos de un fallo en{" "}
        <a href={`mailto:${EMPRESA.correoSeguridad}`}>{EMPRESA.correoSeguridad}</a>.
      </p>

      <h2>Cambios</h2>
      <p>
        Si cambiamos esta política, actualizamos la fecha de arriba y avisamos a
        los clientes por correo cuando el cambio sea relevante.
      </p>
    </PaginaLegal>
  );
}
