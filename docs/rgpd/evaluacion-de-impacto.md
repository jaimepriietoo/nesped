# Evaluación de impacto en protección de datos (art. 35 RGPD)

Borrador del 25-09-2026. Es obligatoria aquí porque se combinan tres
criterios de la lista de la AEPD: grabación de voz a gran escala, uso de
tecnologías nuevas (IA conversacional) y transferencias internacionales.

## 1. Descripción del tratamiento

Una asistente de voz con IA atiende el teléfono de la empresa cliente: avisa
de que la llamada se graba, conversa, recoge nombre, teléfono, localidad,
dirección y la petición, la clasifica por departamento y envía un correo a
las personas de ese departamento. La llamada queda grabada, transcrita y
resumida en el portal de la empresa cliente.

## 2. Necesidad y proporcionalidad

- **Minimización:** sólo se piden los datos necesarios para atender la
  petición; la dirección, sólo cuando hace falta. Nunca DNI ni datos de pago
  (regla fija del agente).
- **Transparencia:** aviso de grabación al descolgar, con opción de no
  continuar y otra vía de contacto. Política pública en
  `/legal/voice-compliance`.
- **Limitación del plazo:** grabaciones 30 días, transcripciones 90
  (`conservacion-y-borrado.md`).
- **Derechos:** `docs/derechos-de-quien-llama.md`.

## 3. Riesgos y medidas

| Riesgo | Probabilidad antes | Medidas | Riesgo residual |
| --- | --- | --- | --- |
| Acceso de una empresa cliente a datos de otra | Media | Aislamiento por empresa en la base (RLS forzado), pruebas automáticas que lo vigilan | Bajo |
| Robo de una copia de la base | Media | Datos personales cifrados por empresa (AES-256-GCM); clave en sobre KMS abierto sólo por Vercel con credenciales de una hora (OIDC) | Bajo |
| Robo de credenciales de una cuenta del portal | Media | Doble factor (TOTP) y passkeys, sesiones revocables, aviso de accesos anómalos, límites de intentos | Bajo |
| La IA inventa datos o compromisos | Media | Instrucciones que prohíben inventar precios o plazos; lo que dice se revisa por una persona antes de actuar | Medio-bajo |
| Transferencias a EE. UU. | Alta | DPF o cláusulas tipo con cada proveedor; confirmar que no entrenan con los datos | Medio |
| Grabación de datos sensibles que cuenta quien llama | Media | No se preguntan; se borran en los mismos plazos; acceso sólo del departamento correspondiente | Medio-bajo |
| Manipulación del registro de lo ocurrido | Baja | Auditoría encadenada con verificación diaria; copia firmada fuera de Supabase cuando esté el receptor | Bajo |
| Pérdida de datos | Baja | Copias de Supabase y ensayo de restauración (`../seguridad/ensayo-de-restauracion.md`) | Bajo |

## 4. Conclusión provisional

Con las medidas anteriores el riesgo residual es aceptable, **condicionado a**
cerrar las transferencias (contratos y no-entrenamiento) y a completar los
datos legales de la empresa. Revisar esta evaluación cada año o cuando cambie
un proveedor, la finalidad o el modelo de IA.

Firmado: [responsable] · Opinión del DPD, si lo hay: [ ] · Fecha: [ ]
