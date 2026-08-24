import {
  CatchBoundary,
  ClientOnly,
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConcertDetails } from "@/components/ConcertDetails";
import { MapFilters } from "@/components/MapFilters";
import { SiteFooter } from "@/components/SiteFooter";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
import { listConcerts } from "@/lib/concerts.functions";
import { distanceKm, formatDistance, matchesQuery } from "@/lib/concert-filters";
import { SITE_URL } from "@/lib/site";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNearby } from "@/hooks/use-nearby";
import { CalendarDays, Clock, ListMusic, LocateFixed, MapPin } from "lucide-react";
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

// Lo que se ve en lugar del mapa si Leaflet falla. No ofrece "reintentar":
// abajo está la cartelera completa, que es la alternativa útil.
function MapFallbackNotice() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background px-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        No pudimos cargar el mapa. Los recitales están listados más abajo.
      </p>
    </div>
  );
}

/**
 * El contenido que Google puede leer de la home. Los pins del mapa los dibuja
 * Leaflet en el cliente, así que sin esta sección el HTML que sirve el servidor
 * son 29 palabras: logo, botones y nada más. Esto sale renderizado del servidor
 * porque los conciertos ya vienen del loader.
 */
function UpcomingSection({
  concerts,
  total,
  distances,
}: {
  concerts: Concert[];
  total: number;
  distances: Map<string, number> | null;
}) {
  const listed = concerts.slice(0, HOME_LIST_LIMIT);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* El h2 sólo cambia cuando el usuario prende "cerca mío", que es un click
          en el cliente: lo que sirve el servidor —y lee Google— es siempre el
          título con la ciudad. */}
      <h2 className="text-2xl font-bold tracking-tight">
        {distances ? "Recitales cerca tuyo" : "Próximos recitales en Buenos Aires"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        misconciertos es un mapa de los recitales que se vienen en Buenos Aires. Cada pin es un
        show: tocalo y ves la fecha, el horario, desde cuánto salen las entradas y el link para
        comprarlas en el sitio del vendedor oficial. La cartelera se actualiza sola dos veces por
        día.
      </p>

      {listed.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Ningún recital coincide con lo que buscás.{" "}
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
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  {distances?.has(c.id) && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <LocateFixed className="h-3 w-3" />
                      {formatDistance(distances.get(c.id)!)}
                    </span>
                  )}
                  {c.price && (
                    <span className="text-xs font-semibold text-foreground/80">{c.price}</span>
                  )}
                </span>
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
  const [query, setQuery] = useState<string>("");
  const [selected, setSelected] = useState<Concert | null>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const nearby = useNearby();

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

  // Se calcula sobre todos los conciertos, no sobre los filtrados: el mapa y la
  // lista comparten estas distancias y filtrar por fecha no las cambia.
  const distances = useMemo(() => {
    const coords = nearby.coords;
    if (!coords) return null;
    const byId = new Map<string, number>();
    for (const c of allConcerts) byId.set(c.id, distanceKm(coords, c));
    return byId;
  }, [allConcerts, nearby.coords]);

  const filtered = useMemo(() => {
    const matching = allConcerts.filter((c) => {
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo) return false;
      return matchesQuery(c, query);
    });
    // "Cerca mío" no esconde nada: reordena. Filtrar por radio dejaría afuera
    // el show al que igual irías cruzando la ciudad.
    if (!distances) return matching;
    return matching
      .slice()
      .sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
  }, [allConcerts, dateFrom, dateTo, query, distances]);

  const clearNearby = nearby.clear;
  const clearAll = useCallback(() => {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    clearNearby();
  }, [clearNearby]);

  const handleRangeChange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  // El filtro se ancla al alto real del header, medido, en vez de a un offset
  // fijo. El header envuelve a dos filas cada vez que el AuthMenu no entra en
  // la primera —sesión iniciada (el nombre de usuario lo ensancha), ficha
  // abierta a la derecha (se come 440px), zoom del navegador— y con un top a
  // ojo el panel terminaba metido entre la caja de la marca y los botones de
  // sesión, en lugar de abajo de las dos.
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

  const measureHeader = useCallback(() => {
    const header = headerRef.current;
    if (header) setHeaderHeight(header.getBoundingClientRect().height);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    // Una medición ya, sin esperar al primer callback del observer: si no, entre
    // la hidratación y ese callback el panel se queda en el offset del fallback.
    measureHeader();
    const observer = new ResizeObserver(measureHeader);
    observer.observe(header);
    return () => observer.disconnect();
  }, [measureHeader]);

  // Abrir o cerrar la ficha reacomoda el header en el acto. Es estado nuestro,
  // así que lo medimos en el mismo commit en vez de esperar al observer, que
  // llegaría un frame tarde y se vería saltar al panel.
  useEffect(() => {
    measureHeader();
  }, [selected, measureHeader]);

  const mapFallback = <div className="h-full w-full bg-background" aria-hidden />;

  return (
    <main className="bg-background text-foreground">
      {/* El mapa no llega al alto completo a propósito: que asome la lista de
          abajo es lo único que avisa que la página sigue. Con el mapa a pantalla
          completa no habría por dónde scrollear, porque la rueda sobre Leaflet
          hace zoom. */}
      <section className="relative h-[85svh] w-full overflow-hidden">
        <div className={`absolute inset-0 ${selected ? "md:right-[420px]" : ""}`}>
          {/* El mapa va aislado: si Leaflet explota (ya pasó, con un
              "Invalid LatLng" al montar antes de tener tamaño), el error no
              tiene que llevarse puesta la página entera. El resto —header,
              filtro y la cartelera de abajo— sigue en pie. */}
          <CatchBoundary getResetKey={() => "mapa"} errorComponent={MapFallbackNotice}>
            <ClientOnly fallback={mapFallback}>
              <Suspense fallback={mapFallback}>
                <ConcertMap
                  concerts={filtered}
                  selectedId={selected?.id ?? null}
                  onSelect={openConcert}
                  userPosition={nearby.coords}
                />
              </Suspense>
            </ClientOnly>
          </CatchBoundary>
        </div>

        {/* Fijo: la marca y el acceso a la cuenta acompañan el scroll, así no hay
            que volver arriba desde la lista. El filtro no vive acá porque es un
            control del mapa y se va con él. */}
        {/* De md para arriba el header no envuelve nunca: una sola fila. Lo que
            sobra se colapsa en vez de bajar de renglón —ver `selected` más
            abajo—, porque abrir la ficha le come 440px y ahí es donde antes se
            partía en dos y se llevaba puesto al filtro. En celular sí envuelve:
            en un teléfono dos renglones es la forma correcta, y el filtro se
            acomoda solo porque va anclado al alto medido. */}
        <header
          ref={headerRef}
          className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-wrap items-center gap-2 p-3 md:flex-nowrap md:gap-3 md:p-6 ${selected ? "md:pr-[440px]" : ""}`}
        >
          <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-2 shadow-lg backdrop-blur-md md:px-4">
            <img src="/logo.svg" alt="" className="h-7 w-7 shrink-0" />
            <h1 className="truncate text-sm font-semibold tracking-tight">
              misconciertos{" "}
              <span
                className={`hidden text-muted-foreground ${selected ? "xl:inline" : "sm:inline"}`}
              >
                — Mapa de recitales
              </span>
            </h1>
            {/* El contador también lo muestra MapFilters: acá solo aparece cuando
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
            {/* Con la ficha abierta el texto se va y queda el ícono solo: es lo
                que permite sostener la fila única sin sacar el link. */}
            <Link
              to="/agenda"
              aria-label="Agenda de la semana"
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <CalendarDays className="h-3 w-3 text-primary" />
              <span className={selected ? "hidden lg:inline" : undefined}>Agenda</span>
            </Link>
            {/* Para un crawler el mapa no existe (los pins los dibuja Leaflet en el
              cliente): este link es el único camino desde la home hacia las
              fichas de cada concierto. */}
            <Link
              to="/conciertos"
              aria-label="Cartelera completa"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <ListMusic className="h-3 w-3 text-primary" />
              <span className={selected ? "hidden lg:inline" : undefined}>Cartelera</span>
            </Link>
          </div>
          <AuthMenu className="ml-auto" compact={selected !== null} />
        </header>

        {/* Justo debajo del header fijo, pero anclado al mapa: al scrollear se va
            con él. Las clases de top son sólo el fallback del SSR y del primer
            paint —una fila con padding chico, dos si el AuthMenu no entra—;
            apenas mide el ResizeObserver manda el alto real. */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-[119px] z-10 flex px-3 min-[720px]:top-[69px] md:top-[93px] md:px-6 ${selected ? "md:pr-[440px]" : ""}`}
          style={headerHeight ? { top: headerHeight } : undefined}
        >
          <div className="pointer-events-auto flex w-full min-w-0 items-center">
            <MapFilters
              query={query}
              onQueryChange={setQuery}
              from={dateFrom}
              to={dateTo}
              onRangeChange={handleRangeChange}
              count={filtered.length}
              concerts={filtered}
              distances={distances}
              onSelectConcert={openConcert}
              nearby={nearby}
              onClearAll={clearAll}
            />
          </div>
        </div>

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

      <UpcomingSection concerts={filtered} total={allConcerts.length} distances={distances} />
    </main>
  );
}
