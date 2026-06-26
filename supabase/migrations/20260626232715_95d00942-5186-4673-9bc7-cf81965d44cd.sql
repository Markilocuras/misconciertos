
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Concert clicks tracking
CREATE TABLE public.concert_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid REFERENCES public.concerts(id) ON DELETE SET NULL,
  source text,
  buy_url text,
  user_agent text,
  referrer text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.concert_clicks TO anon, authenticated;
GRANT ALL ON public.concert_clicks TO service_role;
ALTER TABLE public.concert_clicks ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous visitors) can record a click
CREATE POLICY "Anyone can insert clicks"
  ON public.concert_clicks FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read stats
GRANT SELECT ON public.concert_clicks TO authenticated;
CREATE POLICY "Admins can view clicks"
  ON public.concert_clicks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_concert_clicks_concert_id ON public.concert_clicks(concert_id);
CREATE INDEX idx_concert_clicks_clicked_at ON public.concert_clicks(clicked_at DESC);
