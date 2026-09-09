-- 1) FUGA DE DATOS
--
-- La vista client_dashboard_summary era SECURITY DEFINER, así que se
-- consultaba con los privilegios de quien la creó y saltaba el RLS de las
-- tablas de debajo. Con la clave anónima de Supabase —que viaja en el
-- navegador de cualquier visitante— devolvía la lista completa de clientes
-- con su nombre, su volumen de llamadas, sus leads y su tasa de conversión.
--
-- Ninguna parte de la aplicación la usa: se comprobó buscando su nombre en
-- todo el código. Se le retira el acceso a los roles públicos en vez de
-- borrarla, por si alguien la consulta a mano desde el panel de Supabase.

revoke all on public.client_dashboard_summary from anon;
revoke all on public.client_dashboard_summary from authenticated;

-- 2) search_path manipulable
--
-- Sin search_path fijo, estas funciones resuelven los nombres de tabla según
-- la configuración de quien las llama. Quien pueda crear un esquema propio
-- puede colocar ahí una tabla `lead_events` y hacer que la función escriba
-- en la suya. Fijarlo elimina la ambigüedad.

alter function public.create_lead_event(uuid, text, text, text, text, jsonb)
  set search_path = public, pg_temp;

alter function public.calculate_lead_score(text, text, text, text)
  set search_path = public, pg_temp;;
