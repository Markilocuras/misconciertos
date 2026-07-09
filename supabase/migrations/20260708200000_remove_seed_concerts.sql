-- Los conciertos de prueba (source='seed') ya no hacen falta: hay datos
-- reales scrapeados y la app dejó de mostrarlos (listConcerts los filtra).
DELETE FROM public.concerts WHERE source = 'seed';
