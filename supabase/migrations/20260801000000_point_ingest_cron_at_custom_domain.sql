-- El sitio pasó a tener dominio propio (misconciertos.com.ar) además del
-- workers.dev que Cloudflare asigna al Worker. El cron seguía golpeando el host
-- viejo; ahora que src/server.ts responde 301 en ese host, net.http_post no
-- sigue redirecciones y el POST se perdería. Se reapunta al dominio propio.
--
-- Solo cambia la URL: el cron schedule y el secreto quedan como estaban.

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
    url := 'https://misconciertos.com.ar/api/public/hooks/ingest-concerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_concert_ingest() FROM PUBLIC, anon, authenticated;
