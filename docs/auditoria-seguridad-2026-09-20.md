# Auditoría de seguridad — 20 de septiembre de 2026

Alcance: autenticación y sesión, aislamiento entre empresas, webhooks,
permisos, entradas, cabeceras/CORS, límites, secretos, dependencias y rutas de
administración. No se modificó `.env.local`, no se cambió el número de voz de
Fibergreen y no se hizo commit ni despliegue.

Ningún sistema conectado a Internet puede prometer que “no entrará ningún
hacker”. El objetivo de esta revisión es eliminar las vías concretas
encontradas, fallar de forma cerrada y dejar pruebas que detecten regresiones.

## Hallazgos corregidos

| Severidad | Hallazgo y explotación | Archivos principales | Arreglo y prueba |
| --- | --- | --- | --- |
| **Crítico** | Varias tareas globales de automatización admitían una sesión de portal. Un manager de una empresa podía disparar acciones, mensajes o llamadas sobre contactos de otras empresas porque los lotes recorrían todas las filas. | `app/api/automation/*` y `app/api/nightly/route.js` | Las tareas globales exigen credencial interna; las rutas interactivas permanecen acotadas. Cubierto por `automatismos.test.mjs`, `security-regression.test.mjs` y e2e de flujos públicos. |
| **Crítico** | Consultas y escrituras del portal confiaban en recordar manualmente `client_id`; varios identificadores (`lead_id`, `call_id`, destinatarios y entregas) podían apuntar a otra empresa. | `lib/server/datos-cliente.js`, rutas bajo `app/api/portal`, rutas de leads/eventos/notas/comentarios/recordatorios | Cliente de datos ligado a la empresa, filtros explícitos en vías de escape y comprobación del recurso antes de actuar. `aislamiento.test.mjs` recorre todas las rutas y prueba lecturas/escrituras reales del envoltorio. |
| **Crítico** | Webhooks útiles podían producir efectos antes de reclamar de forma idempotente el evento o sin fallar cerrados cuando la firma/reclamación no era válida. Un atacante podía falsificar o repetir eventos. | Webhooks de ElevenLabs, Twilio y Stripe; `lib/server/bandeja-webhooks.js`, `lib/server/stripe-webhook-service.js` | Firma obligatoria sobre el cuerpo original, identificador idempotente obligatorio, reclamación atómica antes de efectos y bandeja reintentable. Pruebas en `bandeja-webhooks.test.mjs`, `automatismos.test.mjs`, `twilio.test.mjs` y `post-call.test.mjs`. |
| **Alto** | Un administrador interno podía crear usuarios `admin` o `super_admin`, escalando privilegios. | `app/api/admin/users/route.js` | Sólo `super_admin` puede crear cualquiera de esos roles; entrada limitada/validada y test de regresión específico. |
| **Alto** | La respuesta del inbox enviaba al proveedor antes de registrar el resultado. Si Twilio/Resend aceptaba y después fallaba la base, un reintento duplicaba el mensaje. | `app/api/portal/conversations/respond/route.js`, `app/portal/page.js`, `20260920160735_mensajes_salientes_idempotentes.sql` | Reclamo único `(client_id, request_id)` antes del proveedor, hash del contenido sin PII, estado persistido y misma clave en reintentos del navegador. Un estado incierto no se reenvía a ciegas. Test de orden, unicidad, RLS y ausencia de PII. |
| **Alto** | El restablecimiento y el login permitían diferencias observables, reutilización de tokens/reto o sesiones no revocadas; los límites podían quedar sólo en memoria. | `app/api/login/*`, `lib/server/auth.js`, `lib/server/restablecer.js`, `lib/server/security.js` | Respuestas indistinguibles, scrypt también para cuentas inexistentes, tokens de un solo uso, retos persistidos con intentos atómicos, `session_epoch`, renovación de sesión y límites compartidos que fallan cerrados. Pruebas de enumeración, reuso, expiración y revocación. |
| **Alto** | Faltaba TOTP para las cuentas que no quieren depender del correo/SMS. Guardarlo en claro habría expuesto todos los factores si se filtraba la base. | `lib/server/totp.js`, `app/api/portal/totp/route.js`, login/2FA, `20260920135620_auth_totp_factores.sql` | RFC 6238, ±1 intervalo, no reutilización del mismo paso, AES-256-GCM con clave exclusiva, RLS forzado, alta/confirmación/baja, recuperación y revocación de sesiones. Vectores RFC, manipulación del cifrado y e2e del login TOTP. |
| **Alto** | Los webhooks salientes aceptaban URLs susceptibles de SSRF, redirecciones o cambio de DNS. Podían alcanzar localhost, metadatos cloud o redes privadas. | `lib/server/url-segura.js`, `lib/server/webhooks-salientes.js`, prueba de webhook y alertas operativas | Sólo HTTPS, resolución y conexión fijadas, rechazo de todas las IP privadas/mixtas, sin redirecciones, límites de tiempo/tamaño y validación en **cada** envío. Pruebas de IPv4, IPv6, DNS y redirecciones. |
| **Alto** | Algunas rutas de escritura no consultaban el permiso central y, al quitar la última casilla, manager/agent recuperaban implícitamente todos los permisos de su rol. Un usuario al que se pretendía dejar sin escritura seguía pudiendo modificar datos. | `lib/server/permisos.js`, `lib/server/portal-permissions.js` y escrituras bajo `app/api` | Toda escritura de negocio autenticada usa `puede()`. Owner/admin nunca se restringen; cada acción de manager/agent tiene casilla y falla cerrada si no está marcada; `routing.manage` requiere la suya. Tests estáticos de rutas, catálogo y matriz de roles. |
| **Alto** | Un envío SMS podía confiar en el teléfono aportado por el cuerpo y enviar a un tercero. | `app/api/followup/sms/route.js` | El destinatario sale del contacto de la empresa y se compara en forma canónica. Test de vinculación contacto-destino. |
| **Alto** | Varias rutas administrativas y de IA aceptaban JSON ilimitado o sin esquema; algunas escrituras carecían de CSRF y limitación de frecuencia. El webhook de desvío de voz aún leía un formulario sin límite y los parámetros públicos de dominio/plan no pasaban por Zod. | Rutas de admin, leads, playbooks, variantes, checkout, onboarding e IA; `app/api/voice/desvio/route.js`; `lib/server/esquemas-operaciones.js` | `leerJsonLimitado`/`leerTextoLimitado`, Zod, mismo origen y rate limit donde corresponde. El desvío limita 16 KiB y valida tras comprobar la firma; dominio y plan se validan antes de consultar o redirigir. Una prueba recorre todas las rutas e impide lectores directos de cuerpo o JSON limitado sin esquema. |
| **Medio** | Logs con errores crudos podían incluir correos, teléfonos, cuerpos, tokens, URLs con consulta o stack completo. | `lib/server/observability.mjs` y usos en `app/api`/`lib/server` | Logs JSON centralizados, redacción de campos/valores sensibles y metadatos mínimos. Un test impide cualquier `console.*` fuera del sumidero estructurado. |
| **Medio** | Exportar CSV permitía fórmulas de hoja de cálculo y algunas exportaciones no tenían auditoría/no-cache. | `lib/server/csv.js`, exportaciones de leads y auditoría | Neutralización incluso tras espacios/controles, escape CSV, auditoría y `no-store`. Tests de fórmulas y barreras de exportación. |
| **Medio** | CSP/cabeceras y CORS no estaban cubiertos contra regresión; rutas caras podían facilitar abuso de coste. | `proxy.js`, copiloto, sugerencias, previsualización y clasificación | CSP con nonce, HSTS, anti-clickjacking, MIME sniffing, permisos y COOP; sin CORS `*`; límites persistentes en rutas caras. Tests estáticos y funcionales. |
| **Medio** | Cambios administrativos sensibles no siempre quedaban auditados y algunos guardaban cargas libres/PII en `changes`. | Clientes, usuarios, permisos, routing, branding y ajustes | Auditoría por actor/entidad y lista de campos, sin cuerpos, correos ni configuración libre; los fallos de auditoría no se silencian. Tests de minimización. |
| **Medio** | Una actualización parcial de cliente podía aplicar defaults y borrar silenciosamente campos no incluidos. | `lib/server/esquemas-operaciones.js`, `app/api/admin/clients/update/route.js` | Esquema parcial sin defaults, `update` construido sólo con claves presentes y auditoría. Test que comprueba que no aparecen campos adicionales. |
| **Medio** | No había control automático de credenciales en código/historial ni auditoría de dependencias en CI. | `scripts/revisar-secretos.mjs`, `.github/workflows/verificar.yml`, `package.json` | Escaneo sin imprimir valores, historial completo, checkout/actions fijadas por SHA, permisos mínimos y `npm audit --audit-level=high`. Tests del detector. Resultado actual: cero credenciales detectadas y cero vulnerabilidades de npm. |

## Decisiones y pendientes explícitos

| Severidad | Decisión o pendiente | Motivo / mitigación |
| --- | --- | --- |
| **Crítico — acción del propietario** | Rotar cualquier clave que haya sido pegada en un chat o mostrada en pantalla. | El repositorio y su historial están limpios, pero una clave expuesta fuera de Git debe considerarse comprometida. No se reproduce aquí. |
| **Medio** | OAuth/OIDC no se añadió. | La instrucción del trabajo prohíbe SSO. El acceso actual conserva contraseña con scrypt, segundo factor obligatorio por rol y TOTP opcional. |
| **Bajo** | La cookie usa `SameSite=Lax`, no `Strict`. | `Lax` mantiene el retorno de navegaciones superiores desde Stripe y otros proveedores; las escrituras además exigen mismo origen. `HttpOnly`, `Secure` en producción, firma, expiración y `session_epoch` siguen activos. |
| **Bajo** | El build Turbopack local no puede enlazar el proceso/puerto interno en este entorno. | No es un fallo de aplicación. El build de producción `next build --webpack` compila las 150 páginas; CI seguirá ejecutando el comando configurado y debe confirmar Turbopack en su runner. |
| **Bajo** | Sentry avisa de un import que será obsoleto en v11 y Next avisa de Edge Runtime deprecado. | No es una vulnerabilidad actual. Conviene migrarlo en un cambio separado, pequeño y probado, sin mezclarlo con la auditoría. |

## Verificación ejecutada

- ESLint completo: correcto.
- Unidad: **273/273**.
- Build de producción con Webpack: correcto, **150/150** páginas generadas.
- Playwright: **28/28**.
- `npm audit --audit-level=high`: **0 vulnerabilidades**.
- Escaneo de archivos e historial y búsquedas `git log -p -S`: sin credenciales.
- `npm run volcar:migraciones`: 48 migraciones publicables; una migración de
  alta con datos personales se excluye por diseño y queda documentada.

No se hizo commit, PR, fusión ni despliegue.
