-- Hardening tras la auditoría de seguridad (advisor de Supabase + revisión manual).

-- 1. username con formato garantizado en DB, no solo en el <Input pattern> del
--    cliente: un signUp directo a la API podía meter cualquier string.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,20}$');

-- El trigger ahora sanitiza la metadata: si el username propuesto no cumple el
-- formato, cae al generado, así un signUp malicioso ni rompe el registro ni
-- inserta basura. (El fallback user_xxxxxxxx tiene 13 chars y cumple el CHECK.)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'username';
  fallback text := 'user_' || substr(NEW.id::text, 1, 8);
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    CASE WHEN requested ~ '^[A-Za-z0-9_]{3,20}$' THEN requested ELSE fallback END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  -- username tomado: no bloqueamos el alta, usamos el generado.
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, fallback)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. artist con largo acotado (viene del cliente en el insert de comentarios).
ALTER TABLE public.artist_comments
  ADD CONSTRAINT artist_comments_artist_length CHECK (char_length(artist) <= 200);

-- 3. Anti-spam: máximo 5 comentarios por usuario por minuto.
CREATE OR REPLACE FUNCTION public.check_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.artist_comments
    WHERE user_id = NEW.user_id AND created_at > now() - interval '1 minute'
  ) >= 5 THEN
    RAISE EXCEPTION 'rate limit exceeded: too many comments, slow down';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_comment_rate_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER artist_comments_rate_limit
BEFORE INSERT ON public.artist_comments
FOR EACH ROW EXECUTE FUNCTION public.check_comment_rate_limit();

-- 4. Advisor (performance): (select auth.uid()) se evalúa una vez por query en
--    vez de una vez por fila.
DROP POLICY "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY "Admins can view clicks" ON public.concert_clicks;
CREATE POLICY "Admins can view clicks"
  ON public.concert_clicks FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

DROP POLICY "Users can post their own comments" ON public.artist_comments;
CREATE POLICY "Users can post their own comments"
  ON public.artist_comments FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- 5. Advisor (seguridad): pg_net fuera del schema public. Nada lo usa todavía en
--    este proyecto (el cron de ingesta aún no se agendó acá), así que recrearla
--    es seguro. Sus funciones viven en el schema net, sin cambios para quien la use.
DROP EXTENSION IF EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
