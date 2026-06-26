import { Calendar, Clock, MapPin, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Concert } from "@/data/concerts";

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

  const dateLabel = new Date(concert.date + "T00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

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
            <span className="capitalize">{dateLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 text-primary" />
            <span>{concert.time} hs</span>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-foreground/80">{concert.description}</p>

        <div className="mt-auto space-y-3 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase text-muted-foreground">Desde</span>
            <span className="text-lg font-semibold">{concert.price}</span>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              try {
                fetch("/api/public/hooks/track-click", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ concertId: concert.id, buyUrl: concert.buyUrl }),
                  keepalive: true,
                }).catch(() => {});
              } catch {
                // ignore
              }
              window.open(concert.buyUrl, "_blank", "noopener,noreferrer");
            }}
          >
            <Ticket className="mr-2 h-4 w-4" />
            Comprar entradas
          </Button>
        </div>
      </div>
    </div>
  );
}
