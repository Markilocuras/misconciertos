import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { ConcertDetails } from "@/components/ConcertDetails";
import { DateFilter } from "@/components/DateFilter";
import { type Concert } from "@/data/concerts";
import { listConcerts, type ConcertRow } from "@/lib/concerts.functions";
import { Music2 } from "lucide-react";
import { AuthMenu } from "@/components/AuthMenu";

// Leaflet toca window al importarse: el mapa solo existe en el cliente.
const ConcertMap = lazy(() =>
  import("@/components/ConcertMap").then((m) => ({ default: m.ConcertMap })),
);

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800",
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800",
  "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800",
  "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800",
  "https://images.unsplash.com/photo-1587731556938-38755b4803a6?w=800",
  "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?w=800",
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function toConcert(c: ConcertRow): Concert | null {
  if (c.lat == null || c.lng == null || c.date == null) return null;
  return {
    id: c.id,
    title: c.title,
    artist: c.artist ?? "",
    venue: c.venue ?? "",
    date: c.date,
    time: c.time ?? "",
    price: c.price ?? "",
    description: c.description ?? "",
    image: c.image_url ?? FALLBACK_IMAGES[hashId(c.id) % FALLBACK_IMAGES.length],
    lat: c.lat,
    lng: c.lng,
    buyUrl: c.buy_url ?? "#",
    source: c.source,
  };
}

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
        ...(c.buyUrl && c.buyUrl !== "#" ? { url: c.buyUrl } : {}),
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
      { property: "og:url", content: "https://misconciertos.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://misconciertos.lovable.app/" }],
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
