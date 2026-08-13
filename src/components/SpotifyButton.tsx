import { Button } from "@/components/ui/button";
import type { Concert } from "@/data/concerts";
import { trackEvent } from "@/lib/analytics";

// Lucide no trae logos de marcas, así que el de Spotify va inline. Se queda
// siempre en el verde de marca (#1ED760) en vez de heredar el color del botón:
// las guías de Spotify piden ese verde, negro o blanco, nada más.
function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#1ED760" aria-hidden="true" className={className}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

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
          <SpotifyIcon className="h-4 w-4" />
          Escuchar en Spotify
        </a>
      </Button>
    </div>
  );
}
