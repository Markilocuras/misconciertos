import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { toConcert, formatConcertDate, type Concert } from "@/data/concerts";
import { listConcerts } from "@/lib/concerts.functions";

const BASE_URL = "https://app.misconciertos.workers.dev";
const WEEK_DAYS = 7;

function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });
}

function agendaJsonLd(concerts: Concert[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Agenda de conciertos de la semana en Buenos Aires",
    itemListElement: concerts.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: c.slug ? `${BASE_URL}/concierto/${c.slug}` : c.buyUrl,
    })),
  });
}

export const Route = createFileRoute("/agenda")({
  loader: async () => {
    const res = await listConcerts();
    const today = new Date().toISOString().slice(0, 10);
    const until = plusDays(today, WEEK_DAYS);
    const concerts = (res.concerts ?? [])
      .map(toConcert)
      .filter((c): c is Concert => c !== null && c.date >= today && c.date < until);
    return { concerts, today, until };
  },
  head: ({ loaderData }) => {
    const from = loaderData ? shortDate(loaderData.today) : "";
    const to = loaderData ? shortDate(plusDays(loaderData.until, -1)) : "";
    const title = `Agenda de la semana en Buenos Aires (${from} al ${to}) — misconciertos`;
    const description = loaderData?.concerts.length
      ? `${loaderData.concerts.length} recitales esta semana en Buenos Aires: ${[...new Set(loaderData.concerts.map((c) => c.artist || c.title))].slice(0, 5).join(", ")} y más. Fechas, venues y entradas.`
      : "Los recitales de esta semana en Buenos Aires: fechas, venues y entradas.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `${BASE_URL}/agenda` },
      ],
      links: [{ rel: "canonical", href: `${BASE_URL}/agenda` }],
      scripts: loaderData?.concerts.length
        ? [{ type: "application/ld+json", children: agendaJsonLd(loaderData.concerts) }]
        : [],
    };
  },
  component: AgendaPage,
});

function AgendaPage() {
  const { concerts } = Route.useLoaderData();

  const byDate = new Map<string, Concert[]>();
  for (const c of concerts) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }
  const days = [...byDate.keys()].sort();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Ver en el mapa
        </Link>

        <div className="mt-4 mb-6 flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-2">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agenda de la semana</h1>
            <p className="text-sm text-muted-foreground">
              {concerts.length
                ? `${concerts.length} recitales en Buenos Aires en los próximos 7 días`
                : "Sin recitales anunciados para los próximos 7 días"}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {days.map((date) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary capitalize">
                {formatConcertDate(date)}
              </h2>
              <ul className="space-y-2">
                {(byDate.get(date) ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/concierto/$slug"
                      params={{ slug: c.slug }}
                      disabled={!c.slug}
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
                        <p className="flex items-center gap-3 text-xs text-muted-foreground">
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
