import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Concert } from "@/data/concerts";

type Props = {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  count: number;
  concerts: Concert[];
  onSelectConcert: (c: Concert) => void;
};

export function DateFilter({
  from,
  to,
  onFromChange,
  onToChange,
  count,
  concerts,
  onSelectConcert,
}: Props) {
  const hasFilter = from || to;
  const [listOpen, setListOpen] = useState(false);

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border/60 bg-background/85 p-1.5 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-2 rounded-xl bg-accent/40 px-3 py-2">
        <div className="rounded-lg bg-primary/20 p-1">
          <Calendar className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="date-from" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Desde
          </label>
          <input
            id="date-from"
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="w-[130px] bg-transparent text-sm font-medium text-foreground outline-none [color-scheme:dark]"
          />
        </div>
        <div className="h-4 w-px bg-border/60" />
        <div className="flex items-center gap-1.5">
          <label htmlFor="date-to" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hasta
          </label>
          <input
            id="date-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onToChange(e.target.value)}
            className="w-[130px] bg-transparent text-sm font-medium text-foreground outline-none [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 pr-2">
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
            <ScrollArea className="max-h-80">
              <div className="p-2">
                {concerts.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    Sin conciertos en este rango.
                  </p>
                ) : (
                  concerts
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onSelectConcert(c);
                          setListOpen(false);
                        }}
                        className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent"
                      >
                        <span className="font-medium">{c.artist || c.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.venue} · {c.date}
                        </span>
                      </button>
                    ))
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        {hasFilter && (
          <button
            onClick={() => {
              onFromChange("");
              onToChange("");
            }}
            className="rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Limpiar fechas"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
