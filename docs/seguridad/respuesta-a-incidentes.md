# Respuesta a incidentes de seguridad

Qué hacer, en orden, cuando se sospecha que alguien ha accedido a datos que no
debía, que se han perdido datos o que un secreto se ha filtrado. Complementa
`docs/cuando-se-cae-algo.md`, que cubre las caídas sin fuga de datos.

## Quién hace qué

| Papel | Persona | Contacto |
| --- | --- | --- |
| Responsable del incidente (decide) | [nombre] | [teléfono] |
| Técnico (contiene y arregla) | [nombre] | [teléfono] |
| Comunicación con clientes y AEPD | [nombre] | privacidad@nesped.com |

## Gravedad

- **Crítica:** datos personales expuestos a terceros, o acceso con permisos de
  administración. Se trabaja en ello sin pausa.
- **Alta:** secreto filtrado sin constancia de uso, o fallo que permitiría
  acceder a datos de otra empresa.
- **Media / baja:** intentos bloqueados, fallos sin datos afectados.

## Pasos

1. **Contener (primera hora).**
   - Parar lo que esté pasando: revocar sesiones (portal → Equipo), activar
     los interruptores de emergencia, bloquear la IP en el cortafuegos de
     Vercel.
   - Si hay un secreto comprometido: rotarlo ya (`rotacion-de-secretos.md`).
     Si es AWS, desactivar la clave o quitar el rol.
2. **Conservar pruebas.** No borrar nada. Exportar los registros de Vercel del
   intervalo, el registro de auditoría (`npm run verificar:auditoria`) y los
   avisos de anomalías.
3. **Evaluar.** Qué datos, de qué empresas, cuántas personas, desde cuándo.
4. **Notificar.**
   - **AEPD:** en menos de **72 horas** desde que se sabe, si hay riesgo para
     las personas (sede electrónica de la AEPD, formulario de brechas).
   - **Empresas clientes afectadas:** sin dilación, porque son las
     responsables y tienen su propio plazo de 72 horas.
   - **Personas afectadas:** si el riesgo es alto (art. 34).
5. **Corregir y cerrar.** Arreglo, prueba automática que impida que vuelva a
   pasar, y una nota en `docs/` con qué pasó, por qué y qué se cambió.

## Registro de incidentes

Todo incidente, aunque no se notifique, se anota (art. 33.5 RGPD):

| Fecha | Qué pasó | Datos afectados | ¿Notificado? | Medidas |
| --- | --- | --- | --- | --- |
| 24-09-2026 | Clave de datos generada y mostrada en el chat de desarrollo | Ninguno: se descartó antes de usarse | No procede | Clave nueva generada sin mostrarse |
| 24-09-2026 | PIN de Ruperta guardado en claro en un resumen de llamada | PIN interno, no datos personales | No procede | Cambiar el PIN |
| 24-09-2026 | Web caída 5 minutos por un valor inválido en AWS_ROLE_ARN | Ninguno | No procede | Vuelta atrás; probar siempre en Preview |
