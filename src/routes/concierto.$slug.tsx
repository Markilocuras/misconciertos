import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Calendar, CalendarDays, Clock, Map as MapIcon, MapPin } from "lucide-react";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
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
function concertJsonLd(c: Concert, slug: string): string {
  const price = c.price ? parsePriceArs(c.price) : null;
  return JSON.stringify({
    "@context": "https://schema.org",
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
    url: `${SITE_URL}/concierto/${slug}`,
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
  });
}

export const Route = createFileRoute("/concierto/$slug")({
  loader: async ({ params }) => {
    const res = await getConcertBySlug({ data: params.slug });
    const concert = res.concert ? toConcert(res.concert) : null;
    if (!concert) throw notFound();
    return { concert, slug: params.slug, related: res.related };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { concert: c, slug } = loaderData;
    const title = `${c.artist || c.title} en ${c.venue} (${c.date}) — misconciertos`;
    const description = `${c.artist || c.title} toca en ${c.venue}, Buenos Aires, el ${formatConcertDate(c.date)}${c.time ? ` a las ${c.time} hs` : ""}.${c.price ? ` Entradas desde ${c.price}.` : ""} Comprá tu entrada.`;
    const pageUrl = `${SITE_URL}/concierto/${slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: pageUrl },
        { property: "og:image", content: c.image },
        { name: "twitter:image", content: c.image },
      ],
      links: [{ rel: "canonical", href: pageUrl }],
      scripts: [{ type: "application/ld+json", children: concertJsonLd(c, slug) }],
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

function ConcertPage() {
  const { concert, related } = Route.useLoaderData();
  const sameVenue = related.filter((c) => c.venue && c.venue === concert.venue);
  const otherVenues = related.filter((c) => !c.venue || c.venue !== concert.venue);

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

            {concert.description && (
              <p className="text-sm leading-relaxed text-foreground/80">{concert.description}</p>
            )}

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
