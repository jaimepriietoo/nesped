import { PaginaLegal } from "@/components/v3/pagina-legal";
import { EMPRESA } from "@/lib/legal";
import { getVoiceCompliancePolicy } from "@/lib/server/compliance.mjs";
import { obtenerPrecios } from "@/lib/server/precios";

export const metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de contratación del servicio de Nesped: alta, precio, cancelación y responsabilidades.",
};

/* Los precios se leen de Stripe, igual que en la página de tarifas: unas
   condiciones que citen un importe distinto del que se cobra no valen nada. */
export const revalidate = 300;

export default async function Terminos() {
  const politica = getVoiceCompliancePolicy();
  const precios = await obtenerPrecios();

  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      actualizado="7 de septiembre de 2026"
      resumen="Qué contratas, qué cuesta, qué se espera de cada parte y cómo se cancela."
    >
      <h2>Qué es esto</h2>
      <p>
        Estas condiciones regulan la contratación del servicio de{" "}
        {EMPRESA.marca}: una capa de voz con inteligencia artificial que atiende
        llamadas telefónicas, registra los contactos y los pone a disposición del
        cliente en un portal.
      </p>
      <p>
        El servicio está dirigido a empresas y profesionales. No es un servicio
        de consumo, así que no aplica el derecho de desistimiento de catorce
        días previsto para consumidores.
      </p>

      <h2>Alta del servicio</h2>
      <p>
        El contrato empieza cuando se completa el pago y se crean las
        credenciales de acceso. A partir de ahí, el cliente configura el desvío
        de sus llamadas desde su propia operadora. {EMPRESA.marca} no toma
        control de la línea del cliente ni exige portabilidad de su número.
      </p>

      <h2>Precio y facturación</h2>
      <p>
        Los planes vigentes son{" "}
        <strong>Starter, {precios?.starter?.precio || "consultar"} al mes</strong> y{" "}
        <strong>Pro, {precios?.pro?.precio || "consultar"} al mes</strong>, más
        planes a medida. Los importes se muestran sin IVA salvo indicación en
        contrario, y el impuesto se aplica según la normativa vigente.
      </p>
      <p>
        La suscripción se cobra por adelantado y se renueva automáticamente cada
        mes hasta que se cancele. Los pagos los procesa Stripe;{" "}
        {EMPRESA.marca} no almacena números de tarjeta.
      </p>
      <p>
        Si un cobro falla, se reintenta. Si sigue sin poder cobrarse, el acceso
        puede suspenderse tras avisar por correo. Los datos no se borran durante
        la suspensión.
      </p>

      <h2>Cancelación</h2>
      <p>
        No hay permanencia. Se cancela desde el portal en cualquier momento y el
        servicio sigue activo hasta el final del periodo ya pagado; no se
        prorratean devoluciones por los días no usados.
      </p>
      <p>
        Al cancelar, el cliente puede exportar sus contactos en CSV desde el
        propio portal. Pasados treinta días desde la baja, los datos se eliminan
        salvo los que haya que conservar por obligación fiscal.
      </p>

      <h2>Obligaciones del cliente</h2>
      <ul>
        <li>Usar el servicio para su propia actividad y no para llamar a terceros sin base legal para hacerlo.</li>
        <li>Informar a las personas que le llamen conforme a la normativa de protección de datos. {EMPRESA.marca} facilita el aviso previo de grabación en cada llamada, pero el responsable de esos datos es el cliente.</li>
        <li>Mantener sus credenciales a salvo y avisar sin demora si sospecha que alguien ha accedido sin permiso.</li>
        <li>No revender el servicio ni dar acceso a terceros ajenos a su organización sin acuerdo previo.</li>
        <li>Ser veraz en el guion del agente: no configurarlo para prometer condiciones que no vaya a cumplir ni para hacerse pasar por otra empresa.</li>
      </ul>

      <h2>Qué hace y qué no hace el agente</h2>
      <p>
        El agente atiende, entiende qué se le pide y registra el contacto. Por
        diseño <strong>no confirma precios, plazos ni disponibilidad</strong>, y
        cuando no sabe algo lo dice y ofrece que llame una persona.
      </p>
      <p>
        Tampoco finge ser humano: si alguien pregunta directamente, lo aclara.
        Cada llamada empieza con el aviso de que la atiende una inteligencia
        artificial y de que se graba.
      </p>

      <h2>Datos y grabaciones</h2>
      <p>
        Sobre las llamadas de los clientes finales, {EMPRESA.marca} actúa como
        encargado del tratamiento y sólo hace lo que el cliente le indica. Las
        grabaciones se conservan {politica.recordingRetentionDays} días y las
        transcripciones {politica.transcriptRetentionDays}. El detalle está en la{" "}
        <a href="/legal/privacidad">política de privacidad</a> y en la{" "}
        <a href="/legal/voice-compliance">política de grabaciones</a>.
      </p>

      <h2>Disponibilidad</h2>
      <p>
        Se trabaja para que el servicio esté disponible de forma continua, pero
        depende de terceros —telefonía, proveedores de modelo, alojamiento— y no
        se garantiza un funcionamiento ininterrumpido salvo que se pacte un
        acuerdo de nivel de servicio por escrito en un plan a medida.
      </p>
      <p>
        Las paradas planificadas se avisan con antelación cuando es posible y se
        hacen fuera del horario comercial español siempre que se pueda.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        La responsabilidad de {EMPRESA.marca} se limita al importe pagado por el
        cliente en los tres meses anteriores al hecho que la origine. No se
        responde del lucro cesante ni de daños indirectos.
      </p>
      <p>
        Esta limitación no se aplica al dolo, a la negligencia grave ni a
        aquello que la ley no permita limitar.
      </p>

      <h2>Cambios en el servicio y en estas condiciones</h2>
      <p>
        El servicio evoluciona. Los cambios que afecten de forma sustancial a lo
        contratado o al precio se comunican por correo con treinta días de
        antelación; si no se aceptan, se puede cancelar sin coste antes de que
        entren en vigor.
      </p>

      <h2>Ley aplicable y jurisdicción</h2>
      <p>
        Se aplica la legislación española. Para cualquier controversia, las
        partes se someten a los juzgados y tribunales del domicilio de{" "}
        {EMPRESA.marca}, renunciando a cualquier otro fuero que pudiera
        corresponderles.
      </p>

      <h2>Contacto</h2>
      <p>
        Dudas sobre estas condiciones:{" "}
        <a href={`mailto:${EMPRESA.correo}`}>{EMPRESA.correo}</a>. Soporte del
        servicio: <a href={`mailto:${EMPRESA.correoSoporte}`}>{EMPRESA.correoSoporte}</a>.
      </p>
    </PaginaLegal>
  );
}
