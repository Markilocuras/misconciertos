-- Schedule the real-data ingest against this project now that hosting moved off
-- Lovable to Cloudflare Workers (app.misconciertos.workers.dev). This project
-- never had the old lovable.app-pointed cron applied (deliberately, since it
-- would have been a dead job calling a site that didn't read from this DB) —
-- this is the first time the ingest cron runs for real here.

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
    url := 'https://app.misconciertos.workers.dev/api/public/hooks/ingest-concerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_concert_ingest() FROM PUBLIC, anon, authenticated;

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
