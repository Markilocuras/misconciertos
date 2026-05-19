import { Calendar } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  count: number;
};

export function DateFilter({ value, onChange, count }: Props) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/60 bg-background/85 px-4 py-2 shadow-lg backdrop-blur-md">
      <Calendar className="h-4 w-4 text-primary" />
      <label htmlFor="date" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Desde
      </label>
      <input
        id="date"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-medium text-foreground outline-none [color-scheme:dark]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Limpiar
        </button>
      )}
      <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
        {count}
      </span>
    </div>
  );
}
