-- Schedule the real-data ingest to run on its own. Extensions pg_cron/pg_net
-- were created in the first migration but nothing ever called cron.schedule,
-- so /api/public/hooks/ingest-concerts only ever ran when triggered by hand.

CREATE OR REPLACE FUNCTION public.trigger_concert_ingest()
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
    url := 'https://misconciertos.lovable.app/api/public/hooks/ingest-concerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

-- Only pg_cron (running as this function's owner) needs to call it.
REVOKE ALL ON FUNCTION public.trigger_concert_ingest() FROM PUBLIC, anon, authenticated;

-- Re-running this migration should not create duplicate jobs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-concerts-twice-daily') THEN
    PERFORM cron.unschedule('ingest-concerts-twice-daily');
  END IF;
END $$;

-- 12:00 and 00:00 UTC ≈ 09:00 and 21:00 Buenos Aires time.
SELECT cron.schedule(
  'ingest-concerts-twice-daily',
  '0 0,12 * * *',
  $$SELECT public.trigger_concert_ingest();$$
);
