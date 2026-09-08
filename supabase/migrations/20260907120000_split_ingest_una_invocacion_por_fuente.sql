-- Partir la ingesta en una invocación del Worker por fuente.
--
-- Cloudflare corta la invocación a los 50 subrequests y ahí entra todo: los
-- fetches a las fuentes, cada llamada a Supabase y cada mail. Con las cinco
-- fuentes en una sola corrida el peor caso pasaba de 60 y se rompía en
-- silencio: lo que corría último devolvía 0 y el mail de aviso fallaba, sin un
-- solo error en el log. Por eso Live Pass entró con un tope de 8 páginas por
-- corrida y tardaba unas diez corridas en cargar sus ~76 fechas.
--
-- Con una fuente por invocación cada una tiene los 50 para ella sola. El
-- endpoint es el mismo, cambia el query param: ?source=allaccess, etc.
--
-- El orden de los jobs importa. allaccess va primero porque daleplay y ticketek
-- se cruzan contra sus buy_url para no duplicar un show que ya entró por otra
-- ticketera, y ahora ese cruce se hace leyendo la base y no una variable en
-- memoria. allevents va última por lo mismo: es la fuente menos autoritativa
-- —republica lo que ya venden las ticketeras— y ve lo que las otras cuatro
-- acaban de escribir.

-- ---------------------------------------------------------------------------
-- 1. Marca de "ya se avisó por mail"
--
-- El digest salía al final de la corrida, con los conciertos que esa misma
-- invocación había insertado. Partida en cinco, esa lógica mandaría cinco mails
-- por corrida, así que el digest pasa a su propia invocación (?digest=1) y "qué
-- es nuevo" deja de ser algo que se calcula en memoria: es una marca en la fila.
--
-- De paso arregla algo que estaba mal: si el envío fallaba, esos conciertos no
-- se avisaban nunca. Ahora quedan sin marcar y entran en el próximo mail.
-- ---------------------------------------------------------------------------

ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS digest_sent_at timestamptz;

COMMENT ON COLUMN public.concerts.digest_sent_at IS
  'Cuándo salió este concierto en el mail de novedades. NULL = todavía no se avisó; el cron concert-digest los junta y los marca.';

-- Todo lo que ya está en la base ya se avisó (o es viejo y no corresponde
-- avisarlo). Sin este backfill, el primer digest después de la migración
-- mandaría un mail con el catálogo entero.
UPDATE public.concerts
  SET digest_sent_at = now()
  WHERE digest_sent_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Disparadores
-- ---------------------------------------------------------------------------

-- La función vieja no tomaba argumentos. Agregar un parámetro con DEFAULT sobre
-- la misma firma crearía una sobrecarga y `SELECT trigger_concert_ingest()`
-- pasaría a ser ambiguo, así que primero se borra.
DROP FUNCTION IF EXISTS public.trigger_concert_ingest();

CREATE OR REPLACE FUNCTION public.trigger_concert_ingest(p_source text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  secret text;
  target text;
BEGIN
  SELECT value INTO secret FROM public.cron_secrets WHERE id = 'ingest';
  IF secret IS NULL THEN
    RAISE EXCEPTION 'ingest cron secret not configured';
  END IF;

  -- Sin fuente corre las cinco juntas, que es el modo de correr a mano. El cron
  -- siempre manda una.
  target := 'https://misconciertos.com.ar/api/public/hooks/ingest-concerts';
  IF p_source IS NOT NULL THEN
    target := target || '?source=' || p_source;
  END IF;

  PERFORM net.http_post(
    url := target,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    -- Una fuente sola ahora abre hasta 30 páginas de evento en serie. El Worker
    -- termina igual si pg_net deja de esperar, pero con 30s el registro de
    -- net._http_response decía "timeout" en corridas que habían salido bien.
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_concert_ingest(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trigger_concert_digest()
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
    url := 'https://misconciertos.com.ar/api/public/hooks/ingest-concerts?digest=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_concert_digest() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Los jobs
-- ---------------------------------------------------------------------------

-- La variable NO se puede llamar `job`: adentro del EXISTS chocaría con la
-- columna de cron.job y Postgres corta con "column reference is ambiguous".
DO $$
DECLARE
  nombre_job text;
BEGIN
  FOREACH nombre_job IN ARRAY ARRAY[
    'ingest-concerts-twice-daily',
    'ingest-allaccess',
    'ingest-daleplay',
    'ingest-ticketek',
    'ingest-livepass',
    'ingest-allevents',
    'concert-digest'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = nombre_job) THEN
      PERFORM cron.unschedule(nombre_job);
    END IF;
  END LOOP;
END $$;

-- Siguen siendo dos corridas por día, 00:00 y 12:00 UTC ≈ 21:00 y 09:00 en
-- Buenos Aires. Los seis minutos entre fuente y fuente son para que dos
-- invocaciones no se pisen: una fuente con el tope lleno abre 30 páginas en
-- serie y puede tardar medio minuto largo.
SELECT cron.schedule('ingest-allaccess', '0 0,12 * * *',  $$SELECT public.trigger_concert_ingest('allaccess');$$);
SELECT cron.schedule('ingest-daleplay',  '6 0,12 * * *',  $$SELECT public.trigger_concert_ingest('daleplay');$$);
SELECT cron.schedule('ingest-ticketek',  '12 0,12 * * *', $$SELECT public.trigger_concert_ingest('ticketek');$$);
SELECT cron.schedule('ingest-livepass',  '18 0,12 * * *', $$SELECT public.trigger_concert_ingest('livepass');$$);
SELECT cron.schedule('ingest-allevents', '24 0,12 * * *', $$SELECT public.trigger_concert_ingest('allevents');$$);

-- El digest cierra la tanda, once minutos después de que arranca la última
-- fuente. No depende de caer justo ahí: junta todo lo que tenga digest_sent_at
-- en NULL, así que si una fuente se atrasa, sus conciertos salen en el mail
-- siguiente en vez de perderse.
SELECT cron.schedule('concert-digest',   '35 0,12 * * *', $$SELECT public.trigger_concert_digest();$$);
