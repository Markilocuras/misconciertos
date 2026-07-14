-- Alertas por artista: captura pública de emails para avisar de nuevos shows.
-- v1 solo almacena (no hay servicio de envío conectado todavía).

CREATE TABLE public.artist_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist text NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 254),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist, email)
);

GRANT INSERT ON public.artist_alerts TO anon, authenticated;
GRANT SELECT ON public.artist_alerts TO authenticated;
GRANT ALL ON public.artist_alerts TO service_role;
ALTER TABLE public.artist_alerts ENABLE ROW LEVEL SECURITY;

-- Formulario público: cualquiera puede suscribirse.
CREATE POLICY "Anyone can subscribe to artist alerts"
  ON public.artist_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Los emails son PII: solo lectura para admins.
CREATE POLICY "Admins can view alerts"
  ON public.artist_alerts FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

-- Freno de spam global (el formulario es anónimo, no hay user_id para limitar
-- por usuario): máximo 30 suscripciones por minuto en total.
CREATE OR REPLACE FUNCTION public.check_alert_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.artist_alerts
    WHERE created_at > now() - interval '1 minute'
  ) >= 30 THEN
    RAISE EXCEPTION 'rate limit exceeded: too many subscriptions, slow down';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_alert_rate_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER artist_alerts_rate_limit
BEFORE INSERT ON public.artist_alerts
FOR EACH ROW EXECUTE FUNCTION public.check_alert_rate_limit();
