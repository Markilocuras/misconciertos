import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Calendar, CalendarDays, Clock, Map as MapIcon, MapPin } from "lucide-react";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
import { concertSummary, realDescription } from "@/lib/concert-copy";
import { getConcertBySlug, type ConcertLinkRow } from "@/lib/concerts.functions";
import { ArtistComments } from "@/components/ArtistComments";
import { ArtistAlert } from "@/components/ArtistAlert";
import { AddToCalendar } from "@/components/AddToCalendar";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { BuyButton } from "@/components/BuyButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/site";

function parsePriceArs(price: string): number | null {
  const digits = price.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// MusicEvent completo: es lo que habilita el carrusel de eventos de Google.
function musicEvent(c: Concert, url: string): Record<string, unknown> {
  const price = c.price ? parsePriceArs(c.price) : null;
  return {
    "@type": "MusicEvent",
    name: c.title,
    startDate: c.time ? `${c.date}T${c.time}:00-03:00` : c.date,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: c.venue || "Buenos Aires",
      geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng },
      address: { "@type": "PostalAddress", addressLocality: "Buenos Aires", addressCountry: "AR" },
    },
    ...(c.artist ? { performer: { "@type": "MusicGroup", name: c.artist } } : {}),
    ...(c.image ? { image: [c.image] } : {}),
    url,
    ...(c.buyUrl && c.buyUrl !== "#"
      ? {
          offers: {
            "@type": "Offer",
            url: c.buyUrl,
            ...(price ? { price, priceCurrency: "ARS" } : {}),
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };
}

// La página canónica de una tanda declara *todas* sus funciones: si no, al
// canonicalizar las fechas repetidas perderíamos el rich result de cada una.
function concertJsonLd(run: Concert[], canonicalUrl: string): string {
  const events = run.map((c) => musicEvent(c, canonicalUrl));
  return JSON.stringify(
    events.length === 1
      ? { "@context": "https://schema.org", ...events[0] }
      : { "@context": "https://schema.org", "@graph": events },
  );
}

export const Route = createFileRoute("/concierto/$slug")({
  loader: async ({ params }) => {
    const res = await getConcertBySlug({ data: params.slug });
    const concert = res.concert ? toConcert(res.concert) : null;
    if (!concert) throw notFound();
    const run = res.run.map(toConcert).filter((c): c is Concert => c !== null);
    // La primera función de la tanda es la canónica. Sin tanda (o si esta ficha
    // ya pasó y quedó fuera) se canonicaliza a sí misma.
    const canonicalSlug = run[0]?.slug || params.slug;
    return { concert, slug: params.slug, related: res.related, run, canonicalSlug };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { concert: c, run, canonicalSlug } = loaderData;
    const title = `${c.artist || c.title} en ${c.venue} (${c.date}) — misconciertos`;
    const description = `${c.artist || c.title} toca en ${c.venue}, Buenos Aires, el ${formatConcertDate(c.date)}${c.time ? ` a las ${c.time} hs` : ""}.${c.price ? ` Entradas desde ${c.price}.` : ""} Comprá tu entrada.`;
    const canonicalUrl = `${SITE_URL}/concierto/${canonicalSlug}`;
    const isCanonical = c.slug === canonicalSlug;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonicalUrl },
        { property: "og:image", content: c.image },
        { name: "twitter:image", content: c.image },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      // Las funciones repetidas apuntan su canonical a la primera, así que el
      // JSON-LD de la tanda entera lo emite solo esa.
      scripts: [
        {
          type: "application/ld+json",
          children: concertJsonLd(isCanonical && run.length ? run : [c], canonicalUrl),
        },
      ],
    };
  },
  component: ConcertPage,
});

// Lista de links a otras fichas. Es lo que conecta las páginas de concierto
// entre sí: hasta que existió, la única forma de llegar a una era el sitemap.
function RelatedList({ title, concerts }: { title: string; concerts: ConcertLinkRow[] }) {
  if (!concerts.length) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">{title}</h2>
      <ul className="space-y-2">
        {concerts.map((c) => (
          <li key={c.id}>
            <Link
              to="/concierto/$slug"
              params={{ slug: c.slug! }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.artist || c.title}</p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {c.venue}
                  </span>
                  {c.date && (
                    <span className="inline-flex items-center gap-1 capitalize">
                      <Calendar className="h-3 w-3" /> {formatConcertDate(c.date)}
                    </span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Todas las funciones de la tanda. Es el bloque que justifica canonicalizar las
// fechas repetidas hacia una sola página: esa página tiene que contener lo que
// tenían las otras.
function RunDates({ run, current }: { run: Concert[]; current: Concert }) {
  if (run.length < 2) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">
        Todas las fechas de {current.artist || current.title} en {current.venue}
      </h2>
      <ul className="space-y-2">
        {run.map((c) => {
          const isCurrent = c.id === current.id;
          return (
            <li key={c.id}>
              <Link
                to="/concierto/$slug"
                params={{ slug: c.slug }}
                aria-current={isCurrent ? "page" : undefined}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition ${
                  isCurrent
                    ? "border-primary/50 bg-primary/10 font-medium"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                <span className="inline-flex items-center gap-2 capitalize">
                  <Calendar className="h-4 w-4 shrink-0 text-primary" />
                  {formatConcertDate(c.date)}
                  {c.time && <span className="text-muted-foreground">{c.time} hs</span>}
                </span>
                {c.price && <span className="shrink-0 text-xs text-foreground/80">{c.price}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConcertPage() {
  const { concert, related, run } = Route.useLoaderData();
  // Las fechas de la tanda ya tienen su propio bloque, no las repetimos abajo.
  const runIds = new Set(run.map((c) => c.id));
  const rest = related.filter((c) => !runIds.has(c.id));
  const sameVenue = rest.filter((c) => c.venue && c.venue === concert.venue);
  const otherVenues = rest.filter((c) => !c.venue || c.venue !== concert.venue);
  const summary = concertSummary(
    concert,
    run.map((c) => c.date),
  );
  const scraped = realDescription(concert.description);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Mucha gente cae acá desde Google sin pasar por el mapa: este es el
            único anzuelo para que descubran el resto del sitio, así que va
            naranja. No compite con "Comprar entradas" porque es más chico. */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90"
        >
          <MapIcon className="h-4 w-4" />
          Ver el mapa de recitales
        </Link>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          <img
            src={concert.image}
            alt={`${concert.artist || concert.title} en ${concert.venue}`}
            className="h-64 w-full object-cover md:h-80"
          />
          <div className="space-y-4 p-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary">{concert.artist}</p>
              <h1 className="mt-1 text-3xl font-bold leading-tight">{concert.title}</h1>
            </div>

            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                <span>{concert.venue}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="capitalize">{formatConcertDate(concert.date)}</span>
              </div>
              {concert.time && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{concert.time} hs</span>
                </div>
              )}
            </div>

            <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
            {scraped && <p className="text-sm leading-relaxed text-foreground/80">{scraped}</p>}

            <div className="space-y-3 border-t border-border pt-4">
              {concert.price && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase text-muted-foreground">Desde</span>
                  <span className="text-lg font-semibold">{concert.price}</span>
                </div>
              )}
              <BuyButton concert={concert} />
              <div className="flex flex-wrap items-center gap-2">
                <AddToCalendar concert={concert} />
                <ShareButton concert={concert} />
                <SaveButton concertId={concert.id} />
              </div>
            </div>

            <RunDates run={run} current={concert} />

            {concert.artist && <ArtistAlert artist={concert.artist} />}
            {concert.artist && <ArtistComments artist={concert.artist} />}
          </div>
        </div>

        <RelatedList
          title={concert.venue ? `Más recitales en ${concert.venue}` : "Más recitales"}
          concerts={sameVenue}
        />
        <RelatedList title="Otros recitales próximos en Buenos Aires" concerts={otherVenues} />

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm">
          <Link
            to="/conciertos"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <CalendarDays className="h-4 w-4" /> Ver todos los recitales
          </Link>
          <Link
            to="/agenda"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Clock className="h-4 w-4" /> Agenda de la semana
          </Link>
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
