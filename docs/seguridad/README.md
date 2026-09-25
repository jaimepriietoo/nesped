# Seguridad de Nesped: estado y documentos

Actualizado el 25-09-2026.

## Hecho y funcionando

- Aislamiento por empresa en la base de datos (RLS forzado) — `docs/rls-por-empresa.md`
- Datos personales cifrados (fase `doble`, lista para `cifrado`) — `docs/diseno-cifrado-datos-personales.md`
- Secretos en sobres de AWS KMS abiertos con credenciales de una hora (OIDC), sin llaves fijas — `docs/sobres-kms.md`
- Doble factor, passkeys, sesiones revocables, avisos de accesos anómalos
- Auditoría encadenada con verificación diaria — `docs/auditoria-encadenada.md`
- CI: pruebas, detector de secretos, `npm audit`, Dependabot y CodeQL
- Revisión obligatoria antes de fusionar y 2FA en los proveedores

## Pendiente

| Tarea | Quién | Documento |
| --- | --- | --- |
| Pasar el cifrado a `cifrado` y, en una semana, a `solo` | Jaime (Vercel) | `docs/diseno-cifrado-datos-personales.md` |
| Activar el cortafuegos de Vercel (después Claude aplica las reglas) | Jaime | — |
| Primer ensayo de restauración | Jaime + Claude | `ensayo-de-restauracion.md` |
| Receptor externo e inmutable de la auditoría (S3 con Object Lock) | Jaime (AWS) + Claude | `docs/auditoria-encadenada.md` |
| Clave por empresa destruible | Claude | `clave-por-empresa.md` |
| Datos legales de la empresa (razón social, NIF, domicilio) en `lib/legal.js` | Jaime | — |
| Firmar RGPD: registro, EIPD, contratos con proveedores | Jaime | `../rgpd/` |
| Rotación de secretos cada 90 días | Jaime + Claude | `rotacion-de-secretos.md` |
| Pentest externo e ISO 27001 | Jaime | `iso-27001.md` |
| Plan de incidentes: nombrar responsables | Jaime | `respuesta-a-incidentes.md` |
