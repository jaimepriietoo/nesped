# Registro de actividades de tratamiento (art. 30 RGPD)

Borrador preparado el 25-09-2026 a partir de lo que hace el código. Lo tiene
que revisar y firmar el responsable de Nesped; los campos entre corchetes
están sin rellenar a propósito.

**Titular:** [razón social] · NIF [ ] · [domicilio] · privacidad@nesped.com
**Delegado de protección de datos:** [nombre o "no designado" y por qué]

Nesped trata datos en dos papeles distintos:

- **Como encargado** (art. 28): los datos de las personas que llaman o
  escriben a las empresas clientes. Cada empresa cliente es la responsable.
- **Como responsable**: los datos de sus propios clientes (las personas que
  usan el portal) y de quien pide información en nesped.com.

---

## A. Como encargado: atención de llamadas y mensajes

| Campo | Contenido |
| --- | --- |
| Responsable | Cada empresa cliente (p. ej. Fibergreen), según su contrato de encargo |
| Finalidad | Atender llamadas y mensajes en nombre del cliente, recoger la petición y avisar al departamento que corresponda |
| Categorías de interesados | Personas que llaman o escriben a la empresa cliente |
| Categorías de datos | Nombre, teléfono, correo, localidad, dirección del servicio, lo que dicen en la llamada (grabación, transcripción, resumen), clasificación de la petición |
| Categorías especiales | No se buscan. Pueden aparecer si quien llama las cuenta; se tratan igual que el resto y se borran en los mismos plazos |
| Decisiones automatizadas | Clasificación por departamento y prioridad. No producen efectos jurídicos: la decisión la toma una persona de la empresa cliente |
| Destinatarios | Personas de la empresa cliente que ésta designa. Subencargados: ver `encargados-y-transferencias.md` |
| Transferencias internacionales | Sí (EE. UU.): ElevenLabs, Google (Gemini), OpenAI, Twilio, Resend, Vercel, Railway, Stripe. Ver garantías en `encargados-y-transferencias.md` |
| Plazos de supresión | Ver `conservacion-y-borrado.md` |
| Medidas de seguridad | Ver `../seguridad/README.md` |

## B. Como responsable: clientes y usuarios del portal

| Campo | Contenido |
| --- | --- |
| Finalidad | Prestar el servicio, gestionar las cuentas, la seguridad del acceso y la relación contractual |
| Base jurídica | Ejecución del contrato (art. 6.1.b) y obligación legal (fiscal) |
| Interesados | Personas de las empresas clientes con acceso al portal |
| Datos | Nombre, correo, teléfono, rol, registros de acceso (IP, navegador, fecha), factores de doble autenticación |
| Destinatarios | Subencargados técnicos; administraciones públicas cuando la ley lo exija |
| Plazos | Mientras dure el contrato y, después, los plazos legales de prescripción |

## C. Como responsable: contacto y demo en la web

| Campo | Contenido |
| --- | --- |
| Finalidad | Responder a quien pide información y hacer la llamada de demostración que solicita |
| Base jurídica | Consentimiento (art. 6.1.a) al pedir la demo o escribir |
| Datos | Teléfono (demo), correo y lo que escriba |
| Plazos | Hasta atender la petición y, como máximo, 12 meses si no hay relación comercial |
