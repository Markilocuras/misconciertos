CREATE TABLE public.concerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  venue TEXT,
  date DATE,
  time TEXT,
  price TEXT,
  description TEXT,
  image_url TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  buy_url TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT concerts_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX concerts_date_idx ON public.concerts (date);
CREATE INDEX concerts_source_idx ON public.concerts (source);

GRANT SELECT ON public.concerts TO anon;
GRANT SELECT ON public.concerts TO authenticated;
GRANT ALL ON public.concerts TO service_role;

ALTER TABLE public.concerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concerts are publicly readable"
  ON public.concerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_concerts_updated_at
BEFORE UPDATE ON public.concerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
