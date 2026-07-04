-- Re-seed sample concerts with upcoming dates so the map shows content
-- while the real scraper is being tuned. Marked source='seed' so we can
-- distinguish from scraped rows.
INSERT INTO public.concerts (source, external_id, title, artist, venue, date, time, price, description, image_url, lat, lng, buy_url)
VALUES
  ('seed','seed-1','Noche Eléctrica','Los Cósmicos','Niceto Club','2026-07-18','21:00','ARS 15.000','Indie rock porteño con visuales en vivo.','https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',-34.5862,-58.4378,'https://www.nicetoclub.com/'),
  ('seed','seed-2','Tango Reimaginado','Quinteto Astor','Usina del Arte','2026-07-25','20:30','ARS 12.000','Tango contemporáneo en La Boca.','https://images.unsplash.com/photo-1535930891776-0c2dfb7fda1a?w=800',-34.6345,-58.3597,'https://www.usinadelarte.org/'),
  ('seed','seed-3','Festival Electrónico','DJ Mendoza','Mandarine Park','2026-08-01','23:00','ARS 25.000','Open air toda la noche junto al río.','https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800',-34.5453,-58.4361,'https://www.mandarinepark.com.ar/'),
  ('seed','seed-4','Rock Nacional','Las Pampas','Teatro Vorterix','2026-08-08','21:30','ARS 18.000','Clásicos del rock argentino en vivo.','https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800',-34.5733,-58.4503,'https://www.vorterix.com/'),
  ('seed','seed-5','Jazz en Palermo','Trío Bohemio','Bebop Club','2026-07-15','22:00','ARS 10.000','Jazz íntimo con tragos de autor.','https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800',-34.5889,-58.4298,'https://bebopclub.com.ar/'),
  ('seed','seed-6','Cumbia Total','Los del Barrio','Estadio Obras','2026-08-15','22:00','ARS 14.000','La mejor cumbia para bailar toda la noche.','https://images.unsplash.com/photo-1574391884720-bbc049ec09ad?w=800',-34.5456,-58.4495,'https://www.estadioobras.com/')
ON CONFLICT (source, external_id) DO UPDATE SET
  date = EXCLUDED.date,
  title = EXCLUDED.title,
  venue = EXCLUDED.venue,
  last_seen_at = now();