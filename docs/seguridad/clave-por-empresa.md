# Clave por empresa que se pueda destruir

## El objetivo

Que al dar de baja a una empresa sus datos queden ilegibles **en todas
partes**, incluidas las copias de seguridad que no se pueden tocar. Es lo que
se llama borrado criptográfico, y es lo que responde a «¿y mis datos en
vuestras copias?» cuando un cliente grande se va.

## Por qué lo de hoy no basta

Hoy cada empresa tiene su propia clave, pero se **calcula** a partir de la
maestra: `HKDF(maestra, client_id)`. Mientras exista la maestra se puede volver
a calcular la de cualquier empresa, así que borrar una empresa no borra su
clave. Guardar una clave aleatoria por empresa en la base tampoco sirve: iría
también en las copias.

## El diseño

1. **Una clave de datos (DEK) aleatoria por empresa**, de 32 bytes.
2. Se guarda **envuelta** con AWS KMS en una tabla `claves_empresa`
   (`client_id`, `dek_envuelta`, `version`, `creada_en`, `destruida_en`).
   La envoltura usa como contexto el `client_id`: un sobre de una empresa no
   se puede abrir como si fuera de otra.
3. **Lo que la hace destruible:** la envoltura de cada empresa se hace con
   una clave KMS **propia de esa empresa** (una `CMK` por cliente, alias
   `nesped/empresa/<client_id>`). Al dar de baja la empresa se programa el
   borrado de su CMK en KMS (7–30 días). Pasado el plazo, ni con las copias de
   la base ni con la maestra se puede recuperar su DEK. Cuesta 1 $ al mes por
   empresa.
4. En ejecución, la DEK de cada empresa se abre una vez y se guarda en memoria
   unos minutos. El cifrado de cada campo no cambia (AES-256-GCM con el
   `client_id` como dato asociado), sólo de dónde sale la clave.

## Pasos para llevarlo a producción

1. AWS: dar al rol `nesped-vercel-kms` permiso para `kms:Decrypt` sobre las
   claves con alias `nesped/empresa/*`, y a un rol de administración (no a
   Vercel) permiso para crearlas y programar su borrado.
2. Migración: tabla `claves_empresa`, con RLS y sin acceso desde el portal.
3. Código: `claveDeEmpresa()` pasa a pedir la DEK a una caché cargada de forma
   asíncrona al empezar cada petición; el envoltorio de Supabase ya tiene el
   punto para esperarla (la materialización de la consulta).
4. Doble lectura durante la transición: si un sobre no abre con la DEK nueva,
   se prueba con la clave calculada de hoy. `npm run recifrar:datos` pasa todo
   a la DEK nueva por lotes.
5. Baja de empresa: borrar filas, programar el borrado de su CMK y anotarlo en
   la auditoría.

Estimación: dos o tres días de trabajo más una semana de convivencia, igual
que las fases del cifrado.
