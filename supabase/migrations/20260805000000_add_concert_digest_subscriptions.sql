-- Aviso por mail de conciertos nuevos: un resumen por corrida de la ingesta.
--
-- Tabla propia y no una columna en profiles porque profiles es de lectura
-- pública (ver 20260709200938): quién se suscribió no tiene por qué serlo.
-- La FK apunta a auth.users y no a profiles para no depender del orden en que
-- corren los triggers de auth.users al crearse la cuenta.

CREATE TABLE public.concert_digest_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Permite darse de baja desde el mail sin iniciar sesión.
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.concert_digest_subscriptions TO authenticated;
GRANT ALL ON public.concert_digest_subscriptions TO service_role;
ALTER TABLE public.concert_digest_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own subscription"
  ON public.concert_digest_subscriptions FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can subscribe themselves"
  ON public.concert_digest_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can unsubscribe themselves"
  ON public.concert_digest_subscriptions FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- El registro pide confirmar el mail, así que al tildar la casilla todavía no
-- hay sesión con la que insertar la fila: la preferencia viaja en la metadata
-- del signup (igual que 'username') y se materializa acá.
CREATE OR REPLACE FUNCTION public.handle_new_user_concert_digest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'notify_new_concerts', 'false') = 'true' THEN
    INSERT INTO public.concert_digest_subscriptions (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_concert_digest() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_concert_digest
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_concert_digest();

-- Los destinatarios salen de auth.users, que PostgREST no expone: esta función
-- es el único puente, y solo para service_role. Filtra los mails sin confirmar
-- para no escribirle nunca a una dirección que no se verificó.
CREATE OR REPLACE FUNCTION public.list_concert_digest_recipients()
RETURNS TABLE (email text, unsubscribe_token uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT u.email::text, s.unsubscribe_token
  FROM public.concert_digest_subscriptions s
  JOIN auth.users u ON u.id = s.user_id
  WHERE u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.list_concert_digest_recipients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_concert_digest_recipients() TO service_role;

-- Baja desde el link del mail: la ejecuta el endpoint con el cliente admin.
CREATE OR REPLACE FUNCTION public.unsubscribe_concert_digest(token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  removed int;
BEGIN
  DELETE FROM public.concert_digest_subscriptions WHERE unsubscribe_token = token;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe_concert_digest(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_concert_digest(uuid) TO service_role;
