import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { ConcertDetails } from "@/components/ConcertDetails";
import { DateFilter } from "@/components/DateFilter";
import { toConcert, type Concert } from "@/data/concerts";
import { listConcerts } from "@/lib/concerts.functions";
import { CalendarDays, Music2 } from "lucide-react";
import { AuthMenu } from "@/components/AuthMenu";

// Leaflet toca window al importarse: el mapa solo existe en el cliente.
const ConcertMap = lazy(() =>
  import("@/components/ConcertMap").then((m) => ({ default: m.ConcertMap })),
);

const BASE_URL = "https://app.misconciertos.workers.dev";

// Rich results de eventos para Google: cada concierto SSR'd como MusicEvent.
function concertsJsonLd(concerts: Concert[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: concerts.slice(0, 50).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "MusicEvent",
        name: c.title,
        startDate: c.time ? `${c.date}T${c.time}:00-03:00` : c.date,
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: c.venue || "Buenos Aires",
          geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng },
          address: { "@type": "PostalAddress", addressLocality: "Buenos Aires", addressCountry: "AR" },
        },
        ...(c.artist ? { performer: { "@type": "MusicGroup", name: c.artist } } : {}),
        ...(c.image ? { image: [c.image] } : {}),
        url: c.slug ? `${BASE_URL}/concierto/${c.slug}` : c.buyUrl,
      },
    })),
  });
}

export const Route = createFileRoute("/")({
  loader: async () => {
    const res = await listConcerts();
    const concerts = (res.concerts ?? [])
      .map(toConcert)
      .filter((c): c is Concert => c !== null);
    return { concerts };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "misconciertos — Mapa de recitales en Buenos Aires" },
      {
        name: "description",
        content:
          "Descubrí y comprá entradas para conciertos en Buenos Aires. Filtrá por fecha y encontralos en un mapa interactivo.",
      },
      { property: "og:title", content: "misconciertos — Mapa de recitales en Buenos Aires" },
      {
        property: "og:description",
        content: "Conciertos en Buenos Aires, en un mapa interactivo.",
      },
      { property: "og:url", content: `${BASE_URL}/` },
    ],
    links: [{ rel: "canonical", href: `${BASE_URL}/` }],
    scripts: loaderData?.concerts.length
      ? [
          {
            type: "application/ld+json",
            children: concertsJsonLd(loaderData.concerts),
          },
        ]
      : [],
  }),
  component: Index,
});

function Index() {
  const { concerts: allConcerts } = Route.useLoaderData();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Concert | null>(null);

  const filtered = useMemo(() => {
    return allConcerts.filter((c) => {
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo, allConcerts]);

  const mapFallback = <div className="h-full w-full bg-background" aria-hidden />;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className={`absolute inset-0 ${selected ? "md:right-[420px]" : ""}`}>
        <ClientOnly fallback={mapFallback}>
          <Suspense fallback={mapFallback}>
            <ConcertMap
              concerts={filtered}
              selectedId={selected?.id ?? null}
              onSelect={(c) => setSelected(c)}
            />
          </Suspense>
        </ClientOnly>
      </div>

      <header className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6 ${selected ? "md:pr-[440px]" : ""}`}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-4 py-2 shadow-lg backdrop-blur-md">
          <div className="rounded-full bg-primary/15 p-1.5">
            <Music2 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">
            misconciertos <span className="hidden text-muted-foreground sm:inline">— Mapa de recitales</span>
          </h1>
          {allConcerts.length === 0 ? (
            <span className="text-xs text-muted-foreground">sin conciertos disponibles</span>
          ) : (
            <span className="text-xs text-muted-foreground">{allConcerts.length} conciertos</span>
          )}
          <Link
            to="/agenda"
            className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            <CalendarDays className="h-3 w-3 text-primary" />
            Agenda
          </Link>
        </div>
        <div className="pointer-events-auto flex items-center gap-3 md:ml-auto">
          <DateFilter
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
            count={filtered.length}
            concerts={filtered}
            onSelectConcert={(c) => setSelected(c)}
          />
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
