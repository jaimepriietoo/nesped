# Subencargados y transferencias internacionales

La lista sale de `lib/legal.js` (`ENCARGADOS`), que es la que ve el público en
la política de privacidad. Si se añade o se quita un proveedor, se cambia allí
y aquí a la vez.

Para cada uno hay que tener **archivado** el contrato de encargo (DPA) y, si
los datos salen del Espacio Económico Europeo, la garantía que lo permite:
adhesión al Marco de Privacidad de Datos UE-EE. UU. (DPF) o cláusulas
contractuales tipo (CCT/SCC) con su evaluación de impacto de la transferencia.

| Proveedor | Qué hace | Dónde | ¿Fuera del EEE? | DPA firmado | Garantía | Revisado |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase | Base de datos y almacenamiento | Irlanda | No | ☐ | — | ☐ |
| Vercel | Web, portal y API | Irlanda (ejecución), EE. UU. (gestión) | Sí | ☐ | DPF / CCT | ☐ |
| Twilio | Línea telefónica, SMS, WhatsApp | EE. UU. e Irlanda | Sí | ☐ | DPF / CCT | ☐ |
| ElevenLabs | Voz, transcripción, grabación | EE. UU. | Sí | ☐ | CCT | ☐ |
| Google (Gemini) vía ElevenLabs | Modelo de lenguaje de la voz | EE. UU. | Sí | ☐ (a través de ElevenLabs) | DPF / CCT | ☐ |
| OpenAI | Clasificación, sugerencias, copiloto | EE. UU. | Sí | ☐ | DPF / CCT | ☐ |
| Railway | Proceso de fondo de la cola (sin datos de llamadas) | EE. UU. | Sí | ☐ | CCT | ☐ |
| Stripe | Cobros | EE. UU. e Irlanda | Sí | ☐ | DPF / CCT | ☐ |
| Resend | Correo transaccional y avisos | EE. UU. | Sí | ☐ | CCT | ☐ |
| Sentry | Registro de errores técnicos | Alemania | No | ☐ | — | ☐ |
| AWS (KMS) | Custodia de la clave que protege los secretos; no ve datos personales | Irlanda | No | ☐ | — | ☐ |

## Comprobaciones pendientes

- **Entrenamiento con los datos.** En ElevenLabs, OpenAI y Google hay que
  confirmar, y dejar por escrito, que los datos de las llamadas **no** se usan
  para entrenar sus modelos. En OpenAI la API no entrena por defecto; en
  ElevenLabs hay que revisar la opción de «zero retention» o equivalente del
  plan.
- **Retención en el proveedor.** ElevenLabs guarda grabaciones y
  transcripciones en su plataforma. Hay que alinear su retención con la
  nuestra (`conservacion-y-borrado.md`) o activar el borrado automático.
- **Aviso a los clientes.** El contrato de encargo con cada empresa cliente
  (ver `docs/legal/contrato-encargo-fibergreen.md`) debe incluir esta lista y
  el compromiso de avisar antes de añadir un subencargado nuevo.
