-- Avisos por artista, ahora también por notificación del navegador.
--
-- Es el mismo producto que artist_alerts —"avisame cuando {artista} anuncie un
-- show"— por otro canal. Tabla aparte y no una columna en artist_alerts porque
-- lo que identifica a un suscripto es distinto: el mail identifica a una
-- persona, el endpoint de push identifica a un navegador. La misma persona con
-- teléfono y computadora son dos suscripciones, y darse de baja en una no
-- puede tocar la otra.

-- ---------------------------------------------------------------------------
-- 1. Las suscripciones
--
-- A diferencia de artist_alerts, acá anon no escribe directo: entra por
-- /api/public/hooks/subscribe-push, que valida el formato de las dos claves
-- antes de insertar. Una suscripción con el p256dh mal copiado no falla al
-- guardarse, falla recién al encriptar, seis horas después y en otra máquina.
--
-- De paso, el endpoint identifica un dispositivo: que la tabla no la pueda
-- leer nadie más que el service_role y los admins es lo mismo que ya vale para
-- los mails de artist_alerts.
-- ---------------------------------------------------------------------------

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist text NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 200),
  -- Los endpoints de FCM rondan los 200 caracteres; 1000 deja aire de sobra y
  -- mantiene la fila adentro del límite de un índice btree.
  endpoint text NOT NULL CHECK (char_length(endpoint) BETWEEN 20 AND 1000),
  -- Punto sin comprimir de P-256 en base64url: 65 bytes = 87 caracteres.
  p256dh text NOT NULL CHECK (char_length(p256dh) = 87),
  -- Secreto de autenticación: 16 bytes = 22 caracteres.
  auth text NOT NULL CHECK (char_length(auth) = 22),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist, endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Suscripciones a avisos por push, una por (artista, navegador). Se escribe sólo desde /api/public/hooks/subscribe-push con el cliente service-role.';

-- Buscar todas las filas de un endpoint es lo que hace la limpieza cuando un
-- push service contesta 410, y la baja desde el navegador.
CREATE INDEX push_subscriptions_endpoint_idx ON public.push_subscriptions (endpoint);

GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Sin política de INSERT ni de DELETE a propósito: anon y authenticated no
-- escriben acá. El único camino es el endpoint, que usa el cliente admin.
CREATE POLICY "Admins can view push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

-- Mismo freno que artist_alerts: el formulario es anónimo, no hay user_id para
-- limitar por usuario, así que el tope es global.
CREATE OR REPLACE FUNCTION public.check_push_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.push_subscriptions
    WHERE created_at > now() - interval '1 minute'
  ) >= 30 THEN
    RAISE EXCEPTION 'rate limit exceeded: too many push subscriptions, slow down';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_push_rate_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER push_subscriptions_rate_limit
BEFORE INSERT ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.check_push_rate_limit();

-- ---------------------------------------------------------------------------
-- 2. La marca de "ya se avisó por push"
--
-- Segunda marca para lo mismo que digest_sent_at, y eso es deliberado aunque
-- cueste. Compartirla obligaría a que push y mail salgan en la misma
-- invocación, y entonces un push service caído dejaría los conciertos sin
-- marcar y repetiría el mail a todo el mundo. Con dos marcas, cada canal falla
-- y reintenta solo.
-- ---------------------------------------------------------------------------

ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

COMMENT ON COLUMN public.concerts.push_sent_at IS
  'Cuándo salió este concierto en un aviso por push. NULL = todavía no se avisó; el cron concert-push los junta y los marca. Gemela de digest_sent_at, separada para que un canal caído no bloquee al otro.';

-- Todo lo que ya está cargado ya se avisó o no corresponde avisarlo. Sin este
-- backfill, el primer push mandaría el catálogo entero — que es exactamente lo
-- que la migración del digest tuvo que prever en su momento.
UPDATE public.concerts
  SET push_sent_at = now()
  WHERE push_sent_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. El disparador y el job
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_concert_push()
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

  -- El dominio propio y no app.misconciertos.workers.dev: net.http_post no
  -- sigue redirecciones y el Worker 301ea ese host.
  PERFORM net.http_post(
    url := 'https://misconciertos.com.ar/api/public/hooks/ingest-concerts?push=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_concert_push() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'concert-push') THEN
    PERFORM cron.unschedule('concert-push');
  END IF;
END $$;

-- Cinco minutos después del digest. No depende de caer justo ahí: junta todo
-- lo que tenga push_sent_at en NULL, así que si una fuente se atrasa, sus
-- conciertos salen en el aviso siguiente en vez de perderse.
SELECT cron.schedule('concert-push', '45 0,12 * * *', $$SELECT public.trigger_concert_push();$$);
