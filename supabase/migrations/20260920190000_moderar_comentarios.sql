-- Moderar los comentarios de artista.
--
-- Hasta ahora un comentario era para siempre: la tabla no tiene politica ni
-- grant de DELETE para nadie —ni para su propio autor— asi que sacar algo que
-- no corresponde obligaba a entrar a la base a mano.
--
-- Se marca en vez de borrar, por el mismo motivo que un concierto rechazado se
-- queda en la tabla: un clic de mas no puede costar un comentario legitimo que
-- despues no se puede recuperar. Y de paso deja ver quien viene publicando
-- cosas que hay que sacar, que con la fila borrada es invisible.

ALTER TABLE public.artist_comments
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Esta es la parte que de verdad esconde el comentario, y la unica que no se
-- puede saltear: sin tocar la politica, el panel lo saca de la ficha pero la
-- fila sigue saliendo por PostgREST con la anon key —que es publica y viaja en
-- el bundle del cliente—, asi que el comentario "borrado" se lee igual pidiendo
-- /rest/v1/artist_comments a mano. Filtrar en el cliente no es moderar.
--
-- El panel no se ve afectado: lee con el cliente service-role, que no pasa por
-- RLS, y por eso sigue viendo los borrados para poder restaurarlos.
DROP POLICY "Artist comments are publicly readable" ON public.artist_comments;
CREATE POLICY "Artist comments are publicly readable"
  ON public.artist_comments FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

-- El panel ordena por fecha sobre toda la tabla, no por artista.
CREATE INDEX artist_comments_created_at_idx ON public.artist_comments (created_at DESC);

-- Nota sobre el rate limit de 5 por minuto (check_comment_rate_limit): cuenta
-- las filas, no las visibles, asi que sigue contando las borradas. Es a
-- proposito — si no, a quien le sacan un comentario le queda el cupo libre.
