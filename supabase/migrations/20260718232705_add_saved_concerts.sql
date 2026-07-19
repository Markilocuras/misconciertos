-- Conciertos guardados por usuario (el "guardar" que el copy del registro
-- prometía desde el principio). Solo filas propias: guardar, ver y quitar.

CREATE TABLE public.saved_concerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK a profiles (no auth.users) para poder embeber con PostgREST,
  -- igual que artist_comments.
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  concert_id uuid NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, concert_id)
);

GRANT SELECT, INSERT, DELETE ON public.saved_concerts TO authenticated;
GRANT ALL ON public.saved_concerts TO service_role;
ALTER TABLE public.saved_concerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their saved concerts"
  ON public.saved_concerts FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can save concerts"
  ON public.saved_concerts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can unsave their concerts"
  ON public.saved_concerts FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);
