import { createFileRoute } from "@tanstack/react-router";
import Firecrawl from "@mendable/firecrawl-js";

import { findVenueCoords } from "@/lib/venues";
import {
  sendNewConcertsDigest,
  type DigestConcert,
  type DigestRecipient,
} from "@/lib/email.server";
import {
  parseAllEventsMarkdown,
  extractAllAccessEventLinks,
  parseAllAccessEventPage,
  parseDalePlayLive,
  parseTicketekMusicList,
  parseTicketekArtistShows,
  parseTicketekShow,
  ticketekApiUrl,
  TICKETEK_SITE,
  safeHttpUrl,
  slugify,
  type ScrapedEvent,
} from "@/lib/ingest-parsers";

// allevents necesita Firecrawl (listado con render); All Access y Dale Play
// sirven HTML estático, así que se leen con fetch directo sin gastar créditos.
const ALLEVENTS_SOURCES: Array<{ key: string; url: string }> = [
  { key: "allevents-concerts", url: "https://allevents.in/buenos-aires/concerts" },
  { key: "allevents-music", url: "https://allevents.in/buenos-aires/music" },
];
const ALLACCESS_HOME = "https://www.allaccess.com.ar/";
const DALEPLAY_LIVE = "https://daleplay.la/live-shows/live/";

// Cloudflare Workers limita los subrequests por invocación; no fetcheamos
// más que esto de páginas de evento nuevas de All Access por corrida.
const MAX_ALLACCESS_EVENT_FETCHES = 20;
// Ídem para Ticketek: páginas de artista (nivel intermedio) y de show.
const MAX_TICKETEK_ARTIST_FETCHES = 8;
const MAX_TICKETEK_SHOW_FETCHES = 12;

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "es-AR,es;q=0.9,en;q=0.8",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { ...BROWSER_HEADERS, accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

type ConcertRowInsert = {
  source: string;
  external_id: string;
  title: string;
  artist: string | null;
  venue: string | null;
  date: string | null;
  time: string | null;
  price: string | null;
  description: string | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  buy_url: string | null;
  last_seen_at: string;
  slug?: string;
};

function toRow(source: string, externalId: string, ev: ScrapedEvent): ConcertRowInsert {
  const coords = findVenueCoords(ev.venue);
  return {
    source,
    external_id: externalId.slice(0, 500),
    title: ev.title,
    artist: ev.artist ?? null,
    venue: ev.venue ?? null,
    date: ev.date,
    time: ev.time ?? null,
    price: ev.price ?? null,
    description: ev.description ?? null,
    image_url: safeHttpUrl(ev.image_url),
    lat: coords.lat,
    lng: coords.lng,
    buy_url: safeHttpUrl(ev.buy_url),
    last_seen_at: new Date().toISOString(),
  };
}

// Sólo guardamos shows futuros con venue geolocalizable (el mapa es de CABA:
// un venue fuera de la tabla de coordenadas queda descartado a propósito).
function keepRow(row: ConcertRowInsert, today: string): boolean {
  return Boolean(row.title && row.date && row.date >= today && row.lat != null && row.lng != null);
}

// Duplicados dentro del mismo batch rompen el upsert de Postgres
// ("cannot affect row a second time"), así que dedupeamos por external_id.
function dedupeByExternalId(rows: ConcertRowInsert[]): ConcertRowInsert[] {
  const map = new Map<string, ConcertRowInsert>();
  for (const row of rows) map.set(row.external_id, row);
  return [...map.values()];
}

type SourceReport = {
  scraped: number;
  upserted: number;
  discarded: number;
  skipped?: number;
  error?: string;
  parsedSample?: ScrapedEvent[];
};

export const Route = createFileRoute("/api/public/hooks/ingest-concerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth con secreto dedicado almacenado en public.cron_secrets (solo
        // service_role puede leerlo). No reutilizamos la anon key, que es pública.
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!provided) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: secretRow, error: secretErr } = await supabaseAdmin
          .from("cron_secrets")
          .select("value")
          .eq("id", "ingest")
          .maybeSingle();
        if (secretErr || !secretRow?.value) {
          return new Response(JSON.stringify({ error: "Server not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { timingSafeEqual } = await import("crypto");
        const a = Buffer.from(provided);
        const b = Buffer.from(secretRow.value);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const debug = url.searchParams.get("debug") === "1";
        const today = new Date().toISOString().slice(0, 10);
        const results: Record<string, SourceReport> = {};

        // Filas futuras ya conocidas: evita re-fetchear páginas de evento de
        // All Access y duplicar shows que Dale Play linkea a otra ticketera.
        const { data: existingRows } = await supabaseAdmin
          .from("concerts")
          .select("source, external_id, buy_url, slug")
          .gte("date", today);
        const knownAllAccessUrls = new Set(
          (existingRows ?? [])
            .filter((r) => r.source === "allaccess")
            .map((r) => r.external_id.split("#")[0]),
        );
        const buyUrlsElsewhere = new Set(
          (existingRows ?? [])
            .filter((r) => r.source !== "daleplay" && r.buy_url)
            .map((r) => r.buy_url as string),
        );

        // Slugs: los existentes se conservan (URLs estables); los nuevos se
        // generan y desempatan contra todo lo ya usado.
        const existingSlugByKey = new Map(
          (existingRows ?? [])
            .filter((r) => r.slug)
            .map((r) => [`${r.source}\0${r.external_id}`, r.slug as string]),
        );
        const usedSlugs = new Set(existingSlugByKey.values());

        // Lo que no esté en existingKeys es un show que entra por primera vez:
        // eso, y solo eso, es lo que se avisa por mail al final de la corrida.
        const existingKeys = new Set(
          (existingRows ?? []).map((r) => `${r.source} ${r.external_id}`),
        );
        const newConcerts: DigestConcert[] = [];

        function assignSlugs(rows: ConcertRowInsert[]) {
          for (const row of rows) {
            const kept = existingSlugByKey.get(`${row.source}\0${row.external_id}`);
            if (kept) {
              row.slug = kept;
              continue;
            }
            const base =
              slugify(`${row.artist || row.title}-${row.venue ?? ""}-${row.date ?? ""}`) ||
              "concierto";
            let candidate = base;
            let i = 2;
            while (usedSlugs.has(candidate)) candidate = `${base}-${i++}`;
            row.slug = candidate;
            usedSlugs.add(candidate);
          }
        }

        async function upsert(
          sourceKey: string,
          rows: ConcertRowInsert[],
          scraped: number,
          skipped = 0,
        ) {
          const kept = dedupeByExternalId(rows.filter((r) => keepRow(r, today)));
          assignSlugs(kept);
          if (kept.length > 0) {
            const { error } = await supabaseAdmin
              .from("concerts")
              .upsert(kept, { onConflict: "source,external_id" });
            if (error) throw error;

            for (const row of kept) {
              const key = `${row.source} ${row.external_id}`;
              if (existingKeys.has(key)) continue;
              existingKeys.add(key);
              newConcerts.push({
                title: row.title,
                artist: row.artist,
                venue: row.venue,
                date: row.date,
                time: row.time,
                slug: row.slug ?? null,
              });
            }
          }
          results[sourceKey] = {
            scraped,
            upserted: kept.length,
            discarded: scraped - kept.length,
            ...(skipped ? { skipped } : {}),
          };
        }

        // --- allevents.in (Firecrawl markdown) --------------------------------
        if (process.env.FIRECRAWL_API_KEY) {
          const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
          for (const { key, url: sourceUrl } of ALLEVENTS_SOURCES) {
            try {
              const scrape = await firecrawl.scrape(sourceUrl, {
                formats: ["markdown"],
                onlyMainContent: true,
                location: { country: "AR", languages: ["es"] },
              });
              const md =
                (scrape as { markdown?: string }).markdown ??
                (scrape as { data?: { markdown?: string } }).data?.markdown ??
                "";
              const events = parseAllEventsMarkdown(md, sourceUrl);
              if (debug) {
                results[key] = {
                  scraped: events.length,
                  upserted: 0,
                  discarded: 0,
                  parsedSample: events.slice(0, 5),
                };
                continue;
              }
              const rows = events.map((ev) =>
                toRow("allevents", ev.buy_url ?? `${ev.title}:${ev.date}`, ev),
              );
              await upsert(key, rows, events.length);
            } catch (err) {
              console.error(`[ingest-concerts] ${key} failed`, err);
              results[key] = {
                scraped: 0,
                upserted: 0,
                discarded: 0,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
        } else {
          results["allevents"] = {
            scraped: 0,
            upserted: 0,
            discarded: 0,
            error: "FIRECRAWL_API_KEY not configured; skipped",
          };
        }

        // --- allaccess.com.ar (fetch directo + JSON-LD por evento) -----------
        try {
          const home = await fetchHtml(ALLACCESS_HOME);
          const links = extractAllAccessEventLinks(home);
          const newLinks = links.filter((l) => !knownAllAccessUrls.has(l));
          const toFetch = newLinks.slice(0, MAX_ALLACCESS_EVENT_FETCHES);
          const skipped = links.length - toFetch.length;

          const events: ScrapedEvent[] = [];
          for (const link of toFetch) {
            try {
              const page = await fetchHtml(link);
              const ev = parseAllAccessEventPage(page, link);
              if (ev) events.push(ev);
            } catch (err) {
              console.error(`[ingest-concerts] allaccess event ${link} failed`, err);
            }
          }

          if (debug) {
            results["allaccess"] = {
              scraped: events.length,
              upserted: 0,
              discarded: 0,
              skipped,
              parsedSample: events.slice(0, 5),
            };
          } else {
            // El mismo show puede tener varias fechas en la misma página, y el
            // external_id lleva la fecha para no pisarlas entre sí.
            const rows = events.map((ev) => toRow("allaccess", `${ev.buy_url}#${ev.date}`, ev));
            for (const ev of events) {
              if (ev.buy_url) buyUrlsElsewhere.add(ev.buy_url);
            }
            await upsert("allaccess", rows, events.length, skipped);
          }
        } catch (err) {
          console.error("[ingest-concerts] allaccess failed", err);
          results["allaccess"] = {
            scraped: 0,
            upserted: 0,
            discarded: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }

        // --- daleplay.la (fetch directo, cards HTML) --------------------------
        try {
          const page = await fetchHtml(DALEPLAY_LIVE);
          const all = parseDalePlayLive(page);
          // Si el show ya entró por otra ticketera (p.ej. Dale Play linkea a
          // All Access), no lo duplicamos.
          const events = all.filter((ev) => !ev.buy_url || !buyUrlsElsewhere.has(ev.buy_url));

          if (debug) {
            results["daleplay"] = {
              scraped: all.length,
              upserted: 0,
              discarded: 0,
              skipped: all.length - events.length,
              parsedSample: events.slice(0, 5),
            };
          } else {
            const rows = events.map((ev) => toRow("daleplay", `${ev.buy_url}#${ev.date}`, ev));
            await upsert("daleplay", rows, events.length, all.length - events.length);
          }
        } catch (err) {
          console.error("[ingest-concerts] daleplay failed", err);
          results["daleplay"] = {
            scraped: 0,
            upserted: 0,
            discarded: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }

        // --- ticketek.com.ar (API CMS JSON, solo Buenos Aires) ----------------
        try {
          const listJson = await fetchJson(ticketekApiUrl("musica"));
          const baItems = parseTicketekMusicList(listJson).filter((i) =>
            ["Capital Federal", "Buenos Aires"].includes(i.state ?? ""),
          );

          // Candidatos: shows directos (artista/venue) + los shows de BA de las
          // páginas de artista (un fetch extra cada una, acotado).
          type Candidate = {
            link: string;
            name: string;
            venue: string | null;
            image: string | null;
          };
          const candidates = new Map<string, Candidate>();
          for (const item of baItems.filter((i) => i.url.includes("/"))) {
            candidates.set(item.url, {
              link: item.url,
              name: item.name,
              venue: item.venue,
              image: item.image,
            });
          }
          const artistPages = baItems
            .filter((i) => !i.url.includes("/"))
            .slice(0, MAX_TICKETEK_ARTIST_FETCHES);
          for (const item of artistPages) {
            try {
              const artistJson = await fetchJson(ticketekApiUrl(item.url));
              for (const show of parseTicketekArtistShows(artistJson)) {
                const locality = show.locality ?? "";
                if (!/^(Capital Federal|Buenos Aires)/.test(locality)) continue;
                if (!candidates.has(show.link)) {
                  candidates.set(show.link, {
                    link: show.link,
                    name: item.name,
                    venue: show.venue ?? item.venue,
                    image: show.image ?? item.image,
                  });
                }
              }
            } catch (err) {
              console.error(`[ingest-concerts] ticketek artist ${item.url} failed`, err);
            }
          }

          const knownTicketekUrls = new Set(
            (existingRows ?? [])
              .filter((r) => r.source === "ticketek")
              .map((r) => r.external_id.split("#")[0]),
          );
          const toFetch = [...candidates.values()]
            .filter((c) => !knownTicketekUrls.has(`${TICKETEK_SITE}/${c.link}`))
            .slice(0, MAX_TICKETEK_SHOW_FETCHES);
          const skipped = candidates.size - toFetch.length;

          const events: ScrapedEvent[] = [];
          for (const candidate of toFetch) {
            try {
              const showJson = await fetchJson(ticketekApiUrl(candidate.link));
              const buyUrl = `${TICKETEK_SITE}/${candidate.link}`;
              for (const perf of parseTicketekShow(showJson)) {
                events.push({
                  title: candidate.name,
                  artist: candidate.name,
                  venue: candidate.venue,
                  date: perf.date,
                  time: perf.time,
                  price: perf.price,
                  // Ticketek no trae descripción y fabricarla acá como
                  // "Concierto en {venue}." dejaba 31 fichas del Movistar Arena
                  // diciendo exactamente lo mismo. El texto de la ficha se
                  // compone al renderizar, con los datos de la fila: ver
                  // src/lib/concert-copy.ts.
                  description: null,
                  image_url: candidate.image,
                  buy_url: buyUrl,
                  locality: null,
                });
              }
            } catch (err) {
              console.error(`[ingest-concerts] ticketek show ${candidate.link} failed`, err);
            }
          }

          const kept = events.filter((ev) => !ev.buy_url || !buyUrlsElsewhere.has(ev.buy_url));
          if (debug) {
            results["ticketek"] = {
              scraped: events.length,
              upserted: 0,
              discarded: 0,
              skipped,
              parsedSample: kept.slice(0, 5),
            };
          } else {
            const rows = kept.map((ev) => toRow("ticketek", `${ev.buy_url}#${ev.date}`, ev));
            await upsert("ticketek", rows, events.length, skipped + (events.length - kept.length));
          }
        } catch (err) {
          console.error("[ingest-concerts] ticketek failed", err);
          results["ticketek"] = {
            scraped: 0,
            upserted: 0,
            discarded: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }

        // Aviso por mail, al final y después de escribir: un problema mandando
        // mails no puede voltear una corrida que ya guardó los conciertos.
        let digest: { new: number; sent: number; failed: number; error?: string } | undefined;
        if (!debug && newConcerts.length > 0) {
          const apiKey = process.env.RESEND_API_KEY;
          if (!apiKey) {
            digest = {
              new: newConcerts.length,
              sent: 0,
              failed: 0,
              error: "RESEND_API_KEY not set",
            };
          } else {
            newConcerts.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
            const { data, error } = await supabaseAdmin.rpc("list_concert_digest_recipients");
            if (error) {
              console.error("[ingest-concerts] recipients failed", error);
              digest = { new: newConcerts.length, sent: 0, failed: 0, error: error.message };
            } else {
              const result = await sendNewConcertsDigest(
                apiKey,
                newConcerts,
                (data ?? []) as DigestRecipient[],
              );
              digest = { new: newConcerts.length, ...result };
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, results, ...(digest ? { digest } : {}) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
