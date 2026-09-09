-- El latido del servidor de voz llama cada treinta segundos, y en cada llamada
-- se comprueba si el mantenimiento de hoy ya está pedido buscando por
-- clave_unica. Son unas 2.900 consultas al día.
--
-- El único índice sobre esa columna es el único parcial, que sólo cubre las
-- filas pendientes o en curso. Esa comprobación mira TODOS los estados —lo que
-- busca es si ya se hizo—, así que no puede usarlo y recorre la tabla entera.
--
-- Con la tabla vacía da igual. Pero la tabla de trabajos sólo crece: cada
-- informe pedido, cada mantenimiento, cada copia de grabación deja su fila. A
-- los seis meses son decenas de miles, y esa consulta las recorrería todas,
-- 2.900 veces al día, para no encontrar nada casi siempre.
--
-- Es exactamente la clase de cosa que sale barata ahora y cara luego, así que
-- se hace ahora, que la tabla está vacía y crear el índice tarda un instante.
create index if not exists trabajos_por_clave
  on public.trabajos (clave_unica)
  where clave_unica is not null;;
