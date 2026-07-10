-- Usernames (for display + comment authorship) and per-artist concert comments.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Usernames aren't sensitive and comments need a public author name, so anyone
-- can read any profile. Rows are only ever created by the trigger below —
-- no client INSERT/UPDATE policy.
CREATE POLICY "Profiles are publicly readable"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

-- Same shape as promote_first_user_to_admin: fires on every new auth.users row.
-- Falls back to a generated username so a signup can never hard-fail even if
-- the 'username' metadata is ever missing (e.g. a future OAuth/magic-link path).
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
  )
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
  -- References profiles (not auth.users) so PostgREST can embed
  -- profiles(username) directly in the same select.
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
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
  WITH CHECK (auth.uid() = user_id);
