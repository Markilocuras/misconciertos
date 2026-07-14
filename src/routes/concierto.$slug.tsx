import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
import { getConcertBySlug } from "@/lib/concerts.functions";
import { ArtistComments } from "@/components/ArtistComments";
import { ArtistAlert } from "@/components/ArtistAlert";
import { AddToCalendar } from "@/components/AddToCalendar";
import { ShareButton } from "@/components/ShareButton";
import { BuyButton } from "@/components/BuyButton";

const BASE_URL = "https://app.misconciertos.workers.dev";

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
    url: `${BASE_URL}/concierto/${slug}`,
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
    return { concert, slug: params.slug };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { concert: c, slug } = loaderData;
    const title = `${c.artist || c.title} en ${c.venue} (${c.date}) — misconciertos`;
    const description = `${c.artist || c.title} toca en ${c.venue}, Buenos Aires, el ${formatConcertDate(c.date)}${c.time ? ` a las ${c.time} hs` : ""}.${c.price ? ` Entradas desde ${c.price}.` : ""} Comprá tu entrada.`;
    const pageUrl = `${BASE_URL}/concierto/${slug}`;
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

function ConcertPage() {
  const { concert } = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Ver en el mapa
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
              </div>
            </div>

            {concert.artist && <ArtistAlert artist={concert.artist} />}
            {concert.artist && <ArtistComments artist={concert.artist} />}
          </div>
        </div>
      </div>
    </main>
  );
}
