-- "Avisame de este show": suscribirse a un show puntual, no a un artista.
--
-- Son dos promesas distintas y conviene tenerlo claro antes de leer el resto:
--
--   seguir un artista → te avisamos cuando anuncie algo nuevo (no sabemos cuándo)
--   seguir un show    → te avisamos el día antes (sabemos exactamente cuándo)
--
-- La segunda no puede significar "cuando se anuncie" porque el show ya tiene
-- fecha: cuando alguien toca el botón, el anuncio ya pasó. Por eso el
-- recordatorio del día anterior es lo único que ese botón puede prometer sin
-- mentir, y por eso esta migración trae su propio disparador en vez de
-- colgarse del cron de novedades.

-- ---------------------------------------------------------------------------
-- 1. push_subscriptions pasa a servir a los dos casos
-- ---------------------------------------------------------------------------

ALTER TABLE public.push_subscriptions
  ALTER COLUMN artist DROP NOT NULL;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS concert_id uuid REFERENCES public.concerts(id) ON DELETE CASCADE;

-- Una suscripción es a un artista o a un show, nunca a los dos ni a ninguno.
-- Sin esto, una fila con las dos columnas en NULL sería una suscripción a nada
-- que no se puede borrar por ningún lado porque no matchea ninguna consulta.
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_artista_o_show
  CHECK (num_nonnulls(artist, concert_id) = 1);

-- Cuándo se mandó el recordatorio de este show a este navegador. Va en la fila
-- de la suscripción y no en concerts: cada suscripción se avisa una vez, y dos
-- personas anotadas al mismo show tienen que recibir las dos.
--
-- (En los avisos por artista la marca vive en concerts.push_sent_at, porque ahí
-- lo que se avisa una sola vez es el concierto, no la suscripción.)
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

COMMENT ON COLUMN public.push_subscriptions.concert_id IS
  'Show puntual que sigue este navegador. Excluyente con artist. El aviso es el recordatorio del día anterior, no el de shows nuevos.';

-- El UNIQUE viejo no alcanza: en Postgres, (NULL, endpoint) no choca con
-- (NULL, endpoint), así que con artist nullable alguien podría anotarse mil
-- veces al mismo show. Dos índices parciales, uno por caso.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_artist_endpoint_key;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_artista_endpoint_idx
  ON public.push_subscriptions (artist, endpoint) WHERE artist IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_show_endpoint_idx
  ON public.push_subscriptions (concert_id, endpoint) WHERE concert_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. El mismo recordatorio, por mail
--
-- Es la alternativa que ofrece el botón cuando el push no va a llegar: adentro
-- del webview de Instagram, con el permiso ya denegado, o en un navegador sin
-- soporte. Tabla propia y no una columna en artist_alerts porque esa tabla es
-- de la otra promesa —"cuando anuncie algo"— y el digest la lee entera
-- slugificando `artist`: una fila con artist en NULL ahí adentro rompería la
-- corrida de novedades.
-- ---------------------------------------------------------------------------

CREATE TABLE public.show_email_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 254
  ),
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concert_id, email)
);

COMMENT ON TABLE public.show_email_reminders IS
  'Recordatorio por mail del día anterior a un show. Es el fallback del botón "Avisame de este show" cuando el push no aplica.';

GRANT SELECT ON public.show_email_reminders TO authenticated;
GRANT ALL ON public.show_email_reminders TO service_role;
ALTER TABLE public.show_email_reminders ENABLE ROW LEVEL SECURITY;

-- Igual que push_subscriptions: nadie escribe directo, sólo el endpoint con el
-- cliente service-role. Los mails son PII, lectura sólo para admins.
CREATE POLICY "Admins can view show email reminders"
  ON public.show_email_reminders FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.check_show_reminder_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.show_email_reminders
    WHERE created_at > now() - interval '1 minute'
  ) >= 30 THEN
    RAISE EXCEPTION 'rate limit exceeded: too many reminders, slow down';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_show_reminder_rate_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER show_email_reminders_rate_limit
BEFORE INSERT ON public.show_email_reminders
FOR EACH ROW EXECUTE FUNCTION public.check_show_reminder_rate_limit();

-- Baja por token desde el link del mail, igual que el digest y los avisos de
-- artista. SECURITY DEFINER porque la tabla no deja borrar a nadie.
CREATE OR REPLACE FUNCTION public.unsubscribe_show_reminder(token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  borradas int;
BEGIN
  DELETE FROM public.show_email_reminders r WHERE r.unsubscribe_token = token;
  GET DIAGNOSTICS borradas = ROW_COUNT;
  RETURN borradas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe_show_reminder(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_show_reminder(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. El disparador y el job
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_show_reminders()
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
    url := 'https://misconciertos.com.ar/api/public/hooks/ingest-concerts?recordatorios=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_show_reminders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'show-reminders') THEN
    PERFORM cron.unschedule('show-reminders');
  END IF;
END $$;

-- Las dos corridas del día, cinco minutos después de los avisos por artista.
-- Para un show del día D, la de 12:50 UTC (09:50 en Buenos Aires) del día D-1
-- es la que llega primero y manda; la de 00:50 UTC del día D —que son las 21:50
-- del D-1— encuentra las filas ya marcadas y no repite. Correr dos veces es a
-- propósito: si una falla, la otra lo cubre el mismo día.
SELECT cron.schedule('show-reminders', '50 0,12 * * *', $$SELECT public.trigger_show_reminders();$$);
