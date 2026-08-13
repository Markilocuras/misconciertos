import { Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Concert } from "@/data/concerts";
import { trackEvent } from "@/lib/analytics";

// No guardamos el id de artista de Spotify, así que se linkea la búsqueda por
// nombre acotada a artistas. Sin credenciales, sin tocar el ingest y sin una
// columna nueva: el reproductor web y la app resuelven las dos la misma URL.
function spotifySearchUrl(artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(artist)}/artists`;
}

export function SpotifyButton({ concert }: { concert: Concert }) {
  const artist = concert.artist.trim();
  // Hay filas scrapeadas sin artista: ahí no hay a quién buscar.
  if (!artist) return null;

  return (
    <div className="rounded-xl bg-accent/30 p-3">
      <p className="text-sm">
        ¿No lo tenés escuchado?
        <span className="block text-xs text-muted-foreground">
          Escuchá a {artist} en Spotify y llegá al show sabiendo los temas.
        </span>
      </p>
      <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
        <a
          href={spotifySearchUrl(artist)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackEvent("spotify_click", {
              concert_id: concert.id,
              artist,
            })
          }
        >
          <Headphones className="mr-2 h-4 w-4" />
          Escuchar en Spotify
        </a>
      </Button>
    </div>
  );
}
