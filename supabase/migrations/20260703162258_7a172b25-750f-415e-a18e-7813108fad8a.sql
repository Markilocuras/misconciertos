
CREATE TABLE IF NOT EXISTS public.cron_secrets (
  id text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only service role can access. No anon / authenticated grants.
REVOKE ALL ON public.cron_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cron_secrets TO service_role;

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;
-- No policies -> anon/authenticated cannot select/insert/update/delete via Data API.

CREATE TRIGGER cron_secrets_updated_at
  BEFORE UPDATE ON public.cron_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed random value for the ingest job (only if missing).
INSERT INTO public.cron_secrets (id, value)
VALUES ('ingest', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;
