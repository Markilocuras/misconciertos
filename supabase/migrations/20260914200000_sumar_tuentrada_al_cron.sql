-- Tu Entrada (Ticketmaster Argentina) entra como sexta fuente.
--
-- Es la que vende Luna Park, el Gran Rex y el Teatro Colón: los tres estaban
-- cargados en VENUE_COORDS desde siempre y no tenían un solo show en el mapa,
-- porque ninguna de las cinco fuentes anteriores los vende.
--
-- Poder sumarla es consecuencia directa del plan pago: con el techo viejo de 50
-- subrequests no entraba. Abre la home y después una página por evento nuevo,
-- que hoy son ~41.
--
-- Corre antes que allevents, como el resto de las ticketeras: allevents es la
-- menos autoritativa y se cruza contra lo que las demás ya escribieron.
-- allevents y el digest se corren unos minutos para hacerle lugar.

DO $$
DECLARE
  nombre_job text;
BEGIN
  FOREACH nombre_job IN ARRAY ARRAY['ingest-tuentrada', 'ingest-allevents', 'concert-digest'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = nombre_job) THEN
      PERFORM cron.unschedule(nombre_job);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule('ingest-tuentrada', '24 0,12 * * *', $$SELECT public.trigger_concert_ingest('tuentrada');$$);
SELECT cron.schedule('ingest-allevents', '30 0,12 * * *', $$SELECT public.trigger_concert_ingest('allevents');$$);
SELECT cron.schedule('concert-digest',   '40 0,12 * * *', $$SELECT public.trigger_concert_digest();$$);
