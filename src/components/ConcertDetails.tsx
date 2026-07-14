import { Link } from "@tanstack/react-router";
import { Calendar, Clock, ExternalLink, MapPin, X } from "lucide-react";
import { ArtistComments } from "@/components/ArtistComments";
import { AddToCalendar } from "@/components/AddToCalendar";
import { ShareButton } from "@/components/ShareButton";
import { BuyButton } from "@/components/BuyButton";
import { formatConcertDate, type Concert } from "@/data/concerts";

type Props = {
  concert: Concert | null;
  onClose: () => void;
};

export function ConcertDetails({ concert, onClose }: Props) {
  if (!concert) {
    return (
      <div className="hidden h-full flex-col items-center justify-center gap-3 p-8 text-center md:flex">
        <div className="rounded-full bg-accent p-4">
          <MapPin className="h-6 w-6 text-accent-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Elegí un concierto</h2>
        <p className="text-sm text-muted-foreground">
          Hacé clic en un punto del mapa para ver los detalles.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="relative">
        <img src={concert.image} alt={concert.title} className="h-56 w-full object-cover" />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-background/80 p-2 backdrop-blur transition hover:bg-background"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">{concert.artist}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{concert.title}</h1>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            <span>{concert.venue}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="capitalize">{formatConcertDate(concert.date)}</span>
          </div>
          {concert.time && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              <span>{concert.time} hs</span>
            </div>
          )}
        </div>

        {concert.description && (
          <p className="text-sm leading-relaxed text-foreground/80">{concert.description}</p>
        )}

        <div className="mt-auto space-y-3 pt-4">
          {concert.price && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase text-muted-foreground">Desde</span>
              <span className="text-lg font-semibold">{concert.price}</span>
            </div>
          )}
          <BuyButton concert={concert} />
          <div className="flex flex-wrap items-center gap-2">
            <AddToCalendar concert={concert} />
            <ShareButton concert={concert} />
          </div>
          {concert.slug && (
            <Link
              to="/concierto/$slug"
              params={{ slug: concert.slug }}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Ver página del concierto <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {concert.artist && <ArtistComments artist={concert.artist} />}
      </div>
    </div>
  );
}
