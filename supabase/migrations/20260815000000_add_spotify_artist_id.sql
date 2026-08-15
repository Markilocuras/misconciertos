-- El botón "Escuchar en Spotify" de la ficha linkeaba a la búsqueda por nombre,
-- que deja al usuario a un click del artista. Para linkear al perfil hace falta
-- el id de Spotify, que la ingesta resuelve contra la API oficial y guarda acá.
--
-- Nullable a propósito: si faltan las credenciales, si la API falla o si el
-- artista no matchea con confianza, la fila entra igual y el botón cae a la
-- búsqueda de siempre. El link nunca depende de que esto tenga valor.
alter table public.concerts
  add column if not exists spotify_artist_id text;

comment on column public.concerts.spotify_artist_id is
  'Id de artista en Spotify resuelto por la ingesta. Null cuando no se pudo resolver: la ficha cae al link de búsqueda.';
