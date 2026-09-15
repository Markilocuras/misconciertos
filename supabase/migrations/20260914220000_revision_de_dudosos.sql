-- Un estado intermedio entre "va al mapa" y "se descarta".
--
-- Hasta ahora la ingesta era binaria: lo que el filtro no agarraba se
-- publicaba. Eso obligaba a que cada término del filtro fuera conservador,
-- porque un falso positivo costaba un recital que no llegaba al mapa. El
-- resultado conocido: el filtro deja pasar ~5% —se colaron la Copa
-- Libertadores y dos visitas guiadas— y cada vez hay que ir a borrarlas a mano.
--
-- Con un estado "pendiente" eso se da vuelta. Equivocarse ya no cuesta un show,
-- cuesta un clic, así que se puede sospechar de cosas que antes no convenía
-- tocar ("museo", "visita", "libertadores").
--
-- NULL es lo normal y significa "nadie tuvo nada que objetar": así las 220
-- filas que ya están siguen visibles sin backfill.
ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS review_status text
  CHECK (review_status IN ('pendiente', 'aprobado', 'rechazado'));

COMMENT ON COLUMN public.concerts.review_status IS
  'NULL = nunca se sospechó, va al mapa. pendiente = la ingesta sospechó y espera revisión. aprobado/rechazado = lo decidió una persona, y la ingesta no lo vuelve a tocar.';

-- El mapa pide las filas visibles en cada carga: el índice parcial es chico
-- porque lo normal es NULL.
CREATE INDEX IF NOT EXISTS concerts_review_status_idx
  ON public.concerts (review_status)
  WHERE review_status IS NOT NULL;

-- "rechazado" además resuelve algo que venía arrastrándose. Borrar la fila no
-- alcanzaba para sacar un evento del mapa: la ingesta arma su lista de
-- conocidos leyendo la base, así que al borrarla el link volvía a contar como
-- nuevo y la corrida siguiente lo levantaba otra vez. Por eso existe
-- SLUGS_NO_MUSICALES, una lista a mano en el código.
--
-- Una fila rechazada se queda en la base —la ingesta la sigue viendo como
-- conocida y no la vuelve a mirar— pero no sale en ninguna consulta pública.
-- Rechazar es, por fin, una acción que se banca sola.
