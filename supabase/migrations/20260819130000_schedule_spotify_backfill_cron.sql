-- El upsert de la ingesta solo le pone spotify_artist_id a las filas que vuelven
-- a aparecer en el scrapeo: un show que ya salió del listado se quedaba con null
-- para siempre y su ficha seguía linkeando a la búsqueda en vez de al perfil del
-- artista. El modo ?spotify=1 del hook resuelve esas filas aparte; esto lo pone
-- a correr solo.
--
-- Va como job separado y no dentro de la corrida normal porque Cloudflare corta
-- la invocación del Worker a los 50 subrequests y el scrapeo ya llega justo:
-- metido ahí adentro se lleva puesto el mail del digest.
--
-- Reusa el mismo secreto 'ingest' de public.cron_secrets: es el mismo endpoint,
-- solo cambia el query param.

CREATE OR REPLACE FUNCTION public.trigger_spotify_backfill()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  secret text;
BEGIN
  SELECT value INTO secret FROM public.cron_secrets WHERE id = 'ingest';
  IF secret IS NULL THEN
    RAISE EXCEPTION 'ingest cron secret not configured';
  END IF;

  PERFORM net.http_post(
    url := 'https://misconciertos.com.ar/api/public/hooks/ingest-concerts?spotify=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_spotify_backfill() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'spotify-backfill-daily') THEN
    PERFORM cron.unschedule('spotify-backfill-daily');
  END IF;
END $$;

-- 06:00 UTC ≈ 03:00 en Buenos Aires: lejos de las dos corridas de la ingesta
-- (00:00 y 12:00 UTC), así nunca compiten por el mismo Worker.
SELECT cron.schedule(
  'spotify-backfill-daily',
  '0 6 * * *',
  $$SELECT public.trigger_spotify_backfill();$$
);
