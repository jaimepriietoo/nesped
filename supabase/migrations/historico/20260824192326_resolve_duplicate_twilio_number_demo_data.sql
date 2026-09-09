-- 'demo' y 'clinica' compartian el mismo numero (+34983460825, la linea real
-- de Telnyx). Son datos de prueba sin clientes reales detras. 'demo' conserva
-- el numero por ser el mas antiguo; 'clinica' queda sin numero asignado,
-- igual que estaria un cliente nuevo antes de que le demos uno.
update public.clients
set twilio_number = null
where id = 'clinica' and twilio_number = '+34983460825';
;
