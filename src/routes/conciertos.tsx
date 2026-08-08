import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
import { listConcerts } from "@/lib/concerts.functions";
import { SITE_URL } from "@/lib/site";

// La cartelera completa: es la única página que linkea a *todos* los conciertos.
// El mapa de la home no sirve para eso (Leaflet dibuja los pins en el cliente,
// así que para un crawler la home no tiene un solo link a /concierto/...) y la
// agenda solo cubre 7 días. Sin esta página las fichas quedan huérfanas y Google
// las deja en "Descubierta: actualmente sin indexar".

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00`).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

function carteleraJsonLd(concerts: Concert[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cartelera de recitales en Buenos Aires",
    numberOfItems: concerts.length,
    itemListElement: concerts.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.artist || c.title,
      url: `${SITE_URL}/concierto/${c.slug}`,
    })),
  });
}

export const Route = createFileRoute("/conciertos")({
  loader: async () => {
    const res = await listConcerts();
    const concerts = (res.concerts ?? [])
      .map(toConcert)
      .filter((c): c is Concert => c !== null && c.slug !== "");
    return { concerts };
  },
  head: ({ loaderData }) => {
    const count = loaderData?.concerts.length ?? 0;
    const title = "Todos los recitales en Buenos Aires — misconciertos";
    const description = count
      ? `Cartelera completa: ${count} recitales y conciertos próximos en Buenos Aires, con fecha, venue, precio y entradas.`
      : "Cartelera completa de recitales y conciertos próximos en Buenos Aires, con fecha, venue, precio y entradas.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `${SITE_URL}/conciertos` },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/conciertos` }],
      scripts: count
        ? [
            {
              type: "application/ld+json",
              children: carteleraJsonLd(loaderData!.concerts),
            },
          ]
        : [],
    };
  },
  component: CarteleraPage,
});

function CarteleraPage() {
  const { concerts } = Route.useLoaderData();

  const byMonth = new Map<string, Concert[]>();
  for (const c of concerts) {
    const key = monthKey(c.date);
    const list = byMonth.get(key) ?? [];
    list.push(c);
    byMonth.set(key, list);
  }
  const months = [...byMonth.keys()].sort();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Ver en el mapa
          </Link>
          <Link
            to="/agenda"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <CalendarDays className="h-4 w-4" /> Agenda de la semana
          </Link>
        </div>

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">Todos los recitales en Buenos Aires</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {concerts.length
              ? `${concerts.length} conciertos próximos, ordenados por fecha`
              : "Sin conciertos anunciados por ahora"}
          </p>
        </div>

        <div className="space-y-8">
          {months.map((month) => (
            <section key={month}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary capitalize">
                {monthLabel(month)}
              </h2>
              <ul className="space-y-2">
                {(byMonth.get(month) ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/concierto/$slug"
                      params={{ slug: c.slug }}
                      className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
                    >
                      <img
                        src={c.image}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.artist || c.title}</p>
                        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 capitalize">
                            <CalendarDays className="h-3 w-3" /> {formatConcertDate(c.date)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {c.venue}
                          </span>
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
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
