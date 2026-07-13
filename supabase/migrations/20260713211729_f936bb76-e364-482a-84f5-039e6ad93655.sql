
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,20}$')
);

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are publicly readable"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

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
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, fallback)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

CREATE TABLE public.artist_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_comments_artist_length CHECK (char_length(artist) <= 200)
);

CREATE INDEX artist_comments_artist_idx ON public.artist_comments (artist);

GRANT SELECT ON public.artist_comments TO anon, authenticated;
GRANT INSERT ON public.artist_comments TO authenticated;
GRANT ALL ON public.artist_comments TO service_role;
ALTER TABLE public.artist_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artist comments are publicly readable"
  ON public.artist_comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can post their own comments"
  ON public.artist_comments FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

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
