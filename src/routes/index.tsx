import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { ConcertDetails } from "@/components/ConcertDetails";
import { DateFilter } from "@/components/DateFilter";
import { SiteFooter } from "@/components/SiteFooter";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
import { listConcerts } from "@/lib/concerts.functions";
import { SITE_URL } from "@/lib/site";
import { useIsMobile } from "@/hooks/use-mobile";
import { CalendarDays, Clock, ListMusic, MapPin } from "lucide-react";
import { AuthMenu } from "@/components/AuthMenu";

// Leaflet toca window al importarse: el mapa solo existe en el cliente.
const ConcertMap = lazy(() =>
  import("@/components/ConcertMap").then((m) => ({ default: m.ConcertMap })),
);

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
          address: {
            "@type": "PostalAddress",
            addressLocality: "Buenos Aires",
            addressCountry: "AR",
          },
        },
        ...(c.artist ? { performer: { "@type": "MusicGroup", name: c.artist } } : {}),
        ...(c.image ? { image: [c.image] } : {}),
        url: c.slug ? `${SITE_URL}/concierto/${c.slug}` : c.buyUrl,
      },
    })),
  });
}

export const Route = createFileRoute("/")({
  loader: async () => {
    const res = await listConcerts();
    const concerts = (res.concerts ?? []).map(toConcert).filter((c): c is Concert => c !== null);
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
      { property: "og:url", content: `${SITE_URL}/` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
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

// Cuántos shows se listan antes de mandar a la cartelera completa.
const HOME_LIST_LIMIT = 24;

/**
 * El contenido que Google puede leer de la home. Los pins del mapa los dibuja
 * Leaflet en el cliente, así que sin esta sección el HTML que sirve el servidor
 * son 29 palabras: logo, botones y nada más. Esto sale renderizado del servidor
 * porque los conciertos ya vienen del loader.
 */
function UpcomingSection({ concerts, total }: { concerts: Concert[]; total: number }) {
  const listed = concerts.slice(0, HOME_LIST_LIMIT);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <h2 className="text-2xl font-bold tracking-tight">Próximos recitales en Buenos Aires</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        misconciertos es un mapa de los recitales que se vienen en Buenos Aires. Cada pin es un
        show: tocalo y ves la fecha, el horario, desde cuánto salen las entradas y el link para
        comprarlas en el sitio del vendedor oficial. La cartelera se actualiza sola dos veces por
        día.
      </p>

      {listed.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No hay recitales en el rango de fechas que elegiste.{" "}
          <Link to="/conciertos" className="text-primary hover:underline">
            Mirá la cartelera completa
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 grid gap-2 md:grid-cols-2">
          {listed.map((c) => (
            <li key={c.id}>
              <Link
                to="/concierto/$slug"
                params={{ slug: c.slug }}
                disabled={!c.slug}
                className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.artist || c.title}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {c.venue}
                    </span>
                    <span className="capitalize">{formatConcertDate(c.date)}</span>
                    {c.time && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {c.time} hs
                      </span>
                    )}
                  </p>
                </div>
                {c.price && (
                  <span className="shrink-0 text-xs font-semibold text-foreground/80">
                    {c.price}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
        <Link
          to="/conciertos"
          className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
        >
          <ListMusic className="h-4 w-4" />
          {total > listed.length ? `Ver los ${total} recitales` : "Ver la cartelera completa"}
        </Link>
        <Link
          to="/agenda"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <CalendarDays className="h-4 w-4" /> Agenda de la semana
        </Link>
      </div>

      <SiteFooter />
    </section>
  );
}

function Index() {
  const { concerts: allConcerts } = Route.useLoaderData();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Concert | null>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // En celular la ficha sobre el mapa queda ilegible: vamos derecho a la página
  // del concierto. Sin slug no hay página, así que ahí cae al panel de siempre.
  const openConcert = useCallback(
    (c: Concert) => {
      if (isMobile && c.slug) {
        navigate({ to: "/concierto/$slug", params: { slug: c.slug } });
        return;
      }
      setSelected(c);
    },
    [isMobile, navigate],
  );

  const filtered = useMemo(() => {
    return allConcerts.filter((c) => {
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo, allConcerts]);

  const mapFallback = <div className="h-full w-full bg-background" aria-hidden />;

  return (
    <main className="bg-background text-foreground">
      {/* El mapa no llega al alto completo a propósito: que asome la lista de
          abajo es lo único que avisa que la página sigue. Con el mapa a pantalla
          completa no habría por dónde scrollear, porque la rueda sobre Leaflet
          hace zoom. */}
      <section className="relative h-[85svh] w-full overflow-hidden">
        <div className={`absolute inset-0 ${selected ? "md:right-[420px]" : ""}`}>
          <ClientOnly fallback={mapFallback}>
            <Suspense fallback={mapFallback}>
              <ConcertMap
                concerts={filtered}
                selectedId={selected?.id ?? null}
                onSelect={openConcert}
              />
            </Suspense>
          </ClientOnly>
        </div>

        {/* En celular no entra todo en una fila: el filtro baja a una segunda línea. */}
        <header
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3 md:gap-3 md:p-6 ${selected ? "md:pr-[440px]" : ""}`}
        >
          <div className="pointer-events-auto order-1 flex min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-2 shadow-lg backdrop-blur-md md:px-4">
            <img src="/logo.svg" alt="" className="h-7 w-7 shrink-0" />
            <h1 className="truncate text-sm font-semibold tracking-tight">
              misconciertos{" "}
              <span className="hidden text-muted-foreground sm:inline">— Mapa de recitales</span>
            </h1>
            {/* El contador también lo muestra DateFilter: acá solo aparece cuando
              sobra ancho, para no empujar al AuthMenu fuera de la primera fila. */}
            {allConcerts.length === 0 ? (
              <span className="hidden text-xs text-muted-foreground 2xl:inline">
                sin conciertos disponibles
              </span>
            ) : (
              <span className="hidden text-xs text-muted-foreground 2xl:inline">
                {allConcerts.length} conciertos
              </span>
            )}
            <Link
              to="/agenda"
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <CalendarDays className="h-3 w-3 text-primary" />
              Agenda
            </Link>
            {/* Para un crawler el mapa no existe (los pins los dibuja Leaflet en el
              cliente): este link es el único camino desde la home hacia las
              fichas de cada concierto. */}
            <Link
              to="/conciertos"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <ListMusic className="h-3 w-3 text-primary" />
              Cartelera
            </Link>
          </div>
          <AuthMenu className="order-2 ml-auto xl:order-3 xl:ml-0" />
          {/* Hasta xl el filtro se lleva una fila entera y el AuthMenu se queda
            arriba a la derecha; recién con ancho de sobra entran los tres en la
            misma fila. Cuando el filtro competía por lugar antes de eso, el que
            caía a la segunda fila era el AuthMenu. */}
          <div className="order-3 flex w-full min-w-0 items-center xl:order-2 xl:ml-auto xl:w-auto">
            <DateFilter
              from={dateFrom}
              to={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
              count={filtered.length}
              concerts={filtered}
              onSelectConcert={openConcert}
            />
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
      </section>

      <UpcomingSection concerts={filtered} total={allConcerts.length} />
    </main>
  );
}
