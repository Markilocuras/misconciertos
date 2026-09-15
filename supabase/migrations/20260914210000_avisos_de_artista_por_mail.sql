-- Los avisos por artista, que hasta hoy no se mandaron nunca.
--
-- La ficha de cada artista tiene un formulario que dice, textual: "te vamos a
-- avisar cuando {artista} anuncie un show nuevo". La gente se anotó —hay tres
-- suscripciones desde el 06/09— y no existía una sola línea de código que
-- leyera esta tabla. Era una promesa rota en producción.
--
-- Falta una sola cosa para poder cumplirla: por dónde se dan de baja. El digest
-- ya tiene su token; esto le da el suyo a cada suscripción, con el mismo
-- mecanismo.

ALTER TABLE public.artist_alerts
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();

-- El token viaja en un link de mail: tiene que ser único para que la baja
-- toque una fila y sólo una.
CREATE UNIQUE INDEX IF NOT EXISTS artist_alerts_unsubscribe_token_key
  ON public.artist_alerts (unsubscribe_token);

COMMENT ON COLUMN public.artist_alerts.unsubscribe_token IS
  'Token del link de baja que va en cada aviso. Único por suscripción (artista + email).';

-- Baja por token, igual que unsubscribe_concert_digest. SECURITY DEFINER
-- porque la tabla no deja borrar a nadie: sólo se entra por acá.
CREATE OR REPLACE FUNCTION public.unsubscribe_artist_alert(token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  borradas int;
BEGIN
  DELETE FROM public.artist_alerts a WHERE a.unsubscribe_token = token;
  GET DIAGNOSTICS borradas = ROW_COUNT;
  -- false es un token que ya no existe. Para quien hace clic dos veces el
  -- resultado es el mismo, así que no es un error.
  RETURN borradas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe_artist_alert(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_artist_alert(uuid) TO service_role;
