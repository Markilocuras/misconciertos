-- Slug por concierto para las páginas individuales (/concierto/{slug}).
-- El ingest conserva el slug de filas existentes para que las URLs sean estables.

ALTER TABLE public.concerts ADD COLUMN slug text;

WITH base AS (
  SELECT id,
    trim(both '-' from lower(regexp_replace(
      coalesce(nullif(artist, ''), title) || '-' || coalesce(venue, '') || '-' || coalesce(date::text, ''),
      '[^a-zA-Z0-9]+', '-', 'g'
    ))) AS b
  FROM public.concerts
),
numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY id) AS rn FROM base
)
UPDATE public.concerts c
SET slug = CASE WHEN n.rn = 1 THEN n.b ELSE n.b || '-' || n.rn END
FROM numbered n
WHERE c.id = n.id;

CREATE UNIQUE INDEX concerts_slug_key ON public.concerts (slug) WHERE slug IS NOT NULL;
