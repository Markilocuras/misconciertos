import { Calendar, X } from "lucide-react";

type Props = {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  count: number;
};

export function DateFilter({ from, to, onFromChange, onToChange, count }: Props) {
  const hasFilter = from || to;

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
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
          {count}
        </span>
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
