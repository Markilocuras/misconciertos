import { useState } from "react";
import { Calendar, LoaderCircle, LocateFixed, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatConcertDate, type Concert } from "@/data/concerts";
import { activePreset, formatDistance, presetRange, PRESETS } from "@/lib/concert-filters";
import type { Nearby } from "@/hooks/use-nearby";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  count: number;
  /** Ya vienen ordenados por quien filtra: acá sólo se pintan. */
  concerts: Concert[];
  distances: Map<string, number> | null;
  onSelectConcert: (concert: Concert) => void;
  nearby: Nearby;
  onClearAll: () => void;
};

function chipClass(active: boolean): string {
  return `inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
    active ? "bg-primary text-primary-foreground" : "bg-accent/60 text-foreground hover:bg-accent"
  }`;
}

export function MapFilters({
  query,
  onQueryChange,
  from,
  to,
  onRangeChange,
  count,
  concerts,
  distances,
  onSelectConcert,
  nearby,
  onClearAll,
}: Props) {
  const [listOpen, setListOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);

  const preset = activePreset(from, to);
  // Un rango elegido a mano no ilumina ningún chip de atajo, pero sí el de "Fechas".
  const hasCustomRange = Boolean((from || to) && !preset);
  const hasAnyFilter = Boolean(query || from || to || nearby.status === "ready");
  const geoFailed = nearby.status === "denied" || nearby.status === "unavailable";

  return (
    <div className="pointer-events-auto w-full min-w-0 rounded-2xl border border-border/60 bg-background/85 p-1.5 shadow-lg backdrop-blur-md md:w-auto md:min-w-[540px]">
      {/* Fila 1: la búsqueda, que es lo que más se usa, se lleva todo el ancho. */}
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-accent/40 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
          <input
            id="map-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar artista, banda o lugar"
            aria-label="Buscar artista, banda o lugar"
            className="w-full min-w-0 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          <Popover open={listOpen} onOpenChange={setListOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary transition hover:bg-primary/25"
                aria-label={`Ver lista de ${count} conciertos`}
              >
                {count}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              {concerts.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  Ningún recital coincide con lo que buscás.
                </p>
              ) : (
                <ScrollArea className="h-80">
                  <div className="p-2">
                    {concerts.map((concert) => {
                      const km = distances?.get(concert.id);
                      return (
                        <button
                          key={concert.id}
                          type="button"
                          onClick={() => {
                            onSelectConcert(concert);
                            setListOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {concert.artist || concert.title}
                            </span>
                            <span className="block truncate text-xs capitalize text-muted-foreground">
                              {concert.venue} · {formatConcertDate(concert.date)}
                            </span>
                          </span>
                          {km !== undefined && (
                            <span className="shrink-0 text-[10px] font-semibold text-primary">
                              {formatDistance(km)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </PopoverContent>
          </Popover>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Limpiar filtros"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Fila 2: los atajos. Scrollea en horizontal para que en celular no se
          apilen en varias filas y le coman alto al mapa. */}
      <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            // Volver a tocar el chip activo saca el filtro: es la forma de
            // deshacerlo sin tener que ir hasta la X.
            onClick={() => {
              if (preset === id) {
                onRangeChange("", "");
                return;
              }
              const range = presetRange(id);
              onRangeChange(range.from, range.to);
            }}
            aria-pressed={preset === id}
            className={chipClass(preset === id)}
          >
            {label}
          </button>
        ))}

        <div className="h-4 w-px shrink-0 bg-border/60" />

        <button
          type="button"
          onClick={() => (nearby.status === "ready" ? nearby.clear() : nearby.request())}
          disabled={nearby.status === "locating"}
          aria-pressed={nearby.status === "ready"}
          className={`${chipClass(nearby.status === "ready")} disabled:opacity-70`}
        >
          {nearby.status === "locating" ? (
            <LoaderCircle className="h-3 w-3 animate-spin" />
          ) : (
            <LocateFixed className={`h-3 w-3 ${nearby.status === "ready" ? "" : "text-primary"}`} />
          )}
          {nearby.status === "locating" ? "Ubicándote…" : "Cerca mío"}
        </button>

        <Popover open={datesOpen} onOpenChange={setDatesOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-pressed={hasCustomRange}
              className={chipClass(hasCustomRange)}
            >
              <Calendar className={`h-3 w-3 ${hasCustomRange ? "" : "text-primary"}`} />
              Fechas
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="date-from"
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Desde
                </label>
                <input
                  id="date-from"
                  type="date"
                  value={from}
                  onChange={(event) => onRangeChange(event.target.value, to)}
                  className="w-full rounded-lg bg-accent/40 px-2 py-1.5 text-sm font-medium text-foreground outline-none [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="date-to"
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Hasta
                </label>
                <input
                  id="date-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => onRangeChange(from, event.target.value)}
                  className="w-full rounded-lg bg-accent/40 px-2 py-1.5 text-sm font-medium text-foreground outline-none [color-scheme:dark]"
                />
              </div>
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => onRangeChange("", "")}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Limpiar fechas
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {geoFailed && (
        <p className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">
          {/* Nada de "el candado": Chrome lo reemplazó por un ícono de controles
              y cada navegador dibuja el suyo. Se lo nombra por dónde está. */}
          {nearby.status === "denied"
            ? "Bloqueaste el permiso de ubicación. Para usarlo, habilitalo en el ícono que está a la izquierda de la dirección del sitio."
            : "No pudimos obtener tu ubicación. Fijate que la ubicación del sistema esté activada."}
        </p>
      )}
    </div>
  );
}
