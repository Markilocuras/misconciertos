import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ConcertMap } from "@/components/ConcertMap";
import { ConcertDetails } from "@/components/ConcertDetails";
import { DateFilter } from "@/components/DateFilter";
import { concerts as allConcerts, type Concert } from "@/data/concerts";
import { Music2 } from "lucide-react";
import { AuthMenu } from "@/components/AuthMenu";


export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({

    meta: [
      { title: "Mapa de Conciertos — Buenos Aires" },
      {
        name: "description",
        content:
          "Descubrí y comprá entradas para conciertos en Buenos Aires. Filtrá por fecha y encontralos en el mapa.",
      },
      { property: "og:title", content: "Mapa de Conciertos — Buenos Aires" },
      {
        property: "og:description",
        content: "Conciertos en Buenos Aires, en un mapa interactivo.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [date, setDate] = useState<string>("");
  const [selected, setSelected] = useState<Concert | null>(null);

  const filtered = useMemo(() => {
    if (!date) return allConcerts;
    return allConcerts.filter((c) => c.date >= date);
  }, [date]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className={`absolute inset-0 ${selected ? "md:right-[420px]" : ""}`}>
        <ConcertMap
          concerts={filtered}
          selectedId={selected?.id ?? null}
          onSelect={(c) => setSelected(c)}
        />
      </div>

      <header className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6 ${selected ? "md:pr-[440px]" : ""}`}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-4 py-2 shadow-lg backdrop-blur-md">
          <div className="rounded-full bg-primary/15 p-1.5">
            <Music2 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">Conciertos BA</h1>
        </div>
        <div className="pointer-events-auto flex items-center gap-3 md:ml-auto">
          <DateFilter value={date} onChange={setDate} count={filtered.length} />
          <AuthMenu />
        </div>
      </header>

      {selected && (
        <>
          <div className="absolute inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-hidden rounded-t-3xl border-t border-border bg-card shadow-2xl md:hidden">
            <ConcertDetails concert={selected} onClose={() => setSelected(null)} />
          </div>
          <aside className="absolute inset-y-0 right-0 z-10 hidden w-[420px] border-l border-border bg-card md:block">
            <ConcertDetails concert={selected} onClose={() => setSelected(null)} />
          </aside>
        </>
      )}
    </main>
  );
}
