// Resolución del id de artista de Spotify, para que la ficha linkee al perfil
// en vez de a la búsqueda por nombre.
//
// Usa el flujo client credentials, que es servidor contra servidor y no
// necesita que nadie inicie sesión. Las credenciales viven en los secrets del
// Worker (SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET), nunca en el bundle.
//
// Todo el módulo está pensado para fallar en silencio: sin credenciales, con la
// API caída o con un match dudoso devuelve null, la fila se guarda igual y el
// botón cae a la búsqueda. El link nunca depende de esto.

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

// Cuántos candidatos pedirle a la búsqueda. Con uno solo, un artista poco
// conocido puede quedar tapado por otro más popular de nombre parecido.
const SEARCH_LIMIT = 5;

/** Compara nombres ignorando mayúsculas, acentos y puntuación. */
function normalizeArtist(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function getSpotifyToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string | null> {
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      console.error("[spotify] token failed", res.status);
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (err) {
    console.error("[spotify] token error", err);
    return null;
  }
}

/**
 * Id del artista, o null si no hay un match confiable.
 *
 * La búsqueda de Spotify siempre devuelve algo, así que el primer resultado no
 * alcanza: para un artista local desconocido puede contestar cualquier cosa de
 * nombre parecido. Solo se acepta un candidato cuyo nombre coincida exactamente
 * una vez normalizado.
 */
export async function findSpotifyArtistId(token: string, artist: string): Promise<string | null> {
  const wanted = normalizeArtist(artist);
  if (!wanted) return null;

  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(artist)}&type=artist&limit=${SEARCH_LIMIT}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error("[spotify] search failed", res.status, artist);
      return null;
    }
    const json = (await res.json()) as {
      artists?: { items?: Array<{ id?: string; name?: string }> };
    };
    const items = json.artists?.items ?? [];
    const match = items.find((a) => a.name && normalizeArtist(a.name) === wanted);
    return match?.id ?? null;
  } catch (err) {
    console.error("[spotify] search error", artist, err);
    return null;
  }
}

/**
 * Resuelve varios artistas de una, sin repetir la llamada para los que se
 * repiten: un run típico trae ocho fechas de un mismo artista.
 */
export async function resolveSpotifyArtistIds(
  artists: string[],
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const unicos = [...new Set(artists.map((a) => a.trim()).filter(Boolean))];
  if (unicos.length === 0) return found;

  const token = await getSpotifyToken(clientId, clientSecret);
  if (!token) {
    console.warn("[spotify] sin credenciales: las fichas caen al link de búsqueda");
    return found;
  }

  for (const artist of unicos) {
    const id = await findSpotifyArtistId(token, artist);
    if (id) found.set(artist, id);
  }
  return found;
}
