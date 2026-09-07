import { createFileRoute } from "@tanstack/react-router";

import { todayInBuenosAires } from "@/lib/timezone";
import { resolveSpotifyArtistIds } from "@/lib/spotify";
import { findVenueCoords } from "@/lib/venues";
import {
  sendIngestAlert,
  sendNewConcertsDigest,
  type DigestConcert,
  type DigestRecipient,
  type FuenteCaida,
} from "@/lib/email.server";
import {
  parseAllEventsListing,
  isBuenosAiresRegion,
  parseLivePassEventLinks,
  parseLivePassEventPage,
  pareceNoMusical,
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

// Las cuatro fuentes sirven HTML estático y se leen con fetch directo. En
// allevents esto antes pasaba por Firecrawl, pero el listado viene renderizado
// del server: la API key nunca estuvo configurada y la fuente no aportó una
// sola fila hasta que se cambió por un fetch normal.
const ALLEVENTS_SOURCES: Array<{ key: string; url: string }> = [
  { key: "allevents-concerts", url: "https://allevents.in/buenos-aires/concerts" },
  { key: "allevents-music", url: "https://allevents.in/buenos-aires/music" },
];
const ALLACCESS_HOME = "https://www.allaccess.com.ar/";
const DALEPLAY_LIVE = "https://daleplay.la/live-shows/live/";
const LIVEPASS_LISTING = "https://livepass.com.ar/taxons/show";

// Cloudflare Workers limita los subrequests por invocación; no fetcheamos
// más que esto de páginas de evento nuevas de All Access por corrida.
const MAX_ALLACCESS_EVENT_FETCHES = 20;
// Ídem para Ticketek: páginas de artista (nivel intermedio) y de show.
const MAX_TICKETEK_ARTIST_FETCHES = 8;
const MAX_TICKETEK_SHOW_FETCHES = 12;
// Ídem para Live Pass, cuyo listado no dice ni el lugar ni el título completo:
// hay que abrir la página de cada evento para sacar el JSON-LD. El tope es
// conservador a propósito porque es la quinta fuente y el presupuesto de
// subrequests ya venía sin margen. Con esto, las ~76 fechas que Live Pass
// publica hoy tardan unas diez corridas en entrar todas; después, cada corrida
// solo mira lo que no conoce y sale casi gratis.
const MAX_LIVEPASS_EVENT_FETCHES = 8;
// Backfill de ids de Spotify (?spotify=1). Cloudflare corta la invocación a los
// 50 subrequests, y una corrida normal ya llega justo, así que el backfill va en
// su propia invocación y con tope propio: por cada artista distinto sale una
// búsqueda mas un update, o sea dos subrequests.
const MAX_SPOTIFY_BACKFILL_ARTISTS = 18;

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
  spotify_artist_id?: string | null;
};

function toRow(source: string, externalId: string, ev: ScrapedEvent): ConcertRowInsert {
  // Si la fuente publica la coordenada (hoy solo Live Pass, en su JSON-LD), esa
  // manda: vale más que VENUE_COORDS porque no depende de que alguien haya
  // cargado el lugar a mano, y así entran salas que la tabla no conoce.
  const propias = ev.lat != null && ev.lng != null ? { lat: ev.lat, lng: ev.lng } : null;
  const coords = propias ?? findVenueCoords(ev.venue);
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
// Motivo por el que una fila scrapeada no llega a la base. Interesa
// distinguirlos: "noCoords" es el único accionable, porque son eventos reales
// de Buenos Aires cuyo venue todavía no está en VENUE_COORDS. Los otros dos son
// descartes correctos (el evento ya pasó, o vino incompleto de la fuente).
type DiscardReason = "noTitleOrDate" | "pastDate" | "noCoords";

function discardReason(row: ConcertRowInsert, today: string): DiscardReason | null {
  if (!row.title || !row.date) return "noTitleOrDate";
  if (row.date < today) return "pastDate";
  if (row.lat == null || row.lng == null) return "noCoords";
  return null;
}

// Duplicados dentro del mismo batch rompen el upsert de Postgres
// ("cannot affect row a second time"), así que dedupeamos por external_id.
function dedupeByExternalId(rows: ConcertRowInsert[]): ConcertRowInsert[] {
  const map = new Map<string, ConcertRowInsert>();
  for (const row of rows) map.set(row.external_id, row);
  return [...map.values()];
}

type SourceReport = {
  // Cuántos ítems sacó el parser del listado, ANTES de descartar por conocidos,
  // por provincia o por tope de fetches. Es el único número que distingue "la
  // fuente no tiene nada nuevo" —normal— de "la fuente se rompió": `scraped`
  // baja a cero solos los días tranquilos, `found` no.
  found?: number;
  scraped: number;
  upserted: number;
  discarded: number;
  skipped?: number;
  // Desglose de `discarded`. Sin esto un venue que falta en VENUE_COORDS se cae
  // en silencio, que es como estuvimos perdiendo shows durante semanas sin
  // enterarnos: el contador subía pero no decía de qué.
  discardedBy?: Record<DiscardReason, number>;
  // Los venues concretos que hay que agregar a VENUE_COORDS. Es la lista de
  // trabajo: cada nombre acá es un evento que se está perdiendo.
  unknownVenues?: string[];
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
        const today = todayInBuenosAires();
        const results: Record<string, SourceReport> = {};

        // El upsert solo le pone el id de Spotify a lo que vuelve a aparecer en
        // el scrapeo, así que un show que ya salió del listado —o que se guardó
        // antes de que existiera la columna— se quedaba con null para siempre y
        // su ficha seguía linkeando a la búsqueda en vez de al perfil. Este modo
        // resuelve esas filas aparte, sobre los shows futuros, que son los
        // únicos que se muestran. No scrapea nada: es solo Spotify + update.
        if (url.searchParams.get("spotify") === "1") {
          const { data: sinId, error: sinIdErr } = await supabaseAdmin
            .from("concerts")
            .select("id, artist")
            .is("spotify_artist_id", null)
            .not("artist", "is", null)
            .gte("date", today)
            .order("date", { ascending: true });
          if (sinIdErr) {
            return new Response(JSON.stringify({ error: sinIdErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const pendientes = (sinId ?? []).filter((r) => r.artist?.trim());
          // Varias fechas del mismo artista se resuelven con una sola búsqueda,
          // así que el tope se cuenta en artistas distintos, no en filas.
          const todos: string[] = [];
          for (const row of pendientes) {
            const artist = (row.artist as string).trim();
            if (!todos.includes(artist)) todos.push(artist);
          }

          // Los que Spotify no matchea —festivales, tributos, títulos de evento
          // usados como artista— quedan pendientes para siempre. Tomando
          // siempre los primeros por fecha taparían a los que sí se pueden
          // resolver, así que la ventana rota un bloque por día y en unas pocas
          // corridas recorre toda la lista.
          const bloque = Math.floor(Date.now() / 86_400_000);
          const desde =
            todos.length > 0 ? (bloque * MAX_SPOTIFY_BACKFILL_ARTISTS) % todos.length : 0;
          const artistas = [...todos.slice(desde), ...todos.slice(0, desde)].slice(
            0,
            MAX_SPOTIFY_BACKFILL_ARTISTS,
          );

          const ids = await resolveSpotifyArtistIds(
            artistas,
            process.env.SPOTIFY_CLIENT_ID,
            process.env.SPOTIFY_CLIENT_SECRET,
          );
          let filas = 0;
          for (const [artist, spotifyId] of ids) {
            const target = pendientes
              .filter((r) => (r.artist as string).trim() === artist)
              .map((r) => r.id);
            if (target.length === 0) continue;
            const { error: updErr } = await supabaseAdmin
              .from("concerts")
              .update({ spotify_artist_id: spotifyId })
              .in("id", target);
            if (updErr) {
              console.error("[ingest-concerts] backfill spotify fallo", artist, updErr);
              continue;
            }
            filas += target.length;
          }

          return new Response(
            JSON.stringify({
              ok: true,
              spotifyBackfill: {
                pendientes: pendientes.length,
                intentados: artistas.length,
                resueltos: ids.size,
                filas,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // Filas futuras ya conocidas: evita re-fetchear páginas de evento de
        // All Access y duplicar shows que Dale Play linkea a otra ticketera.
        const { data: existingRows } = await supabaseAdmin
          .from("concerts")
          .select("source, external_id, buy_url, slug, artist, venue, date")
          .gte("date", today);
        const knownAllAccessUrls = new Set(
          (existingRows ?? [])
            .filter((r) => r.source === "allaccess")
            .map((r) => r.external_id.split("#")[0]),
        );
        // allevents republica shows que ya entraron por la ticketera, y su link
        // nunca coincide (es una URL de allevents), asi que el cruce tiene que ser
        // por lo que de verdad identifica al show: el artista y la fecha. Un
        // artista no toca dos veces en Buenos Aires la misma noche.
        const artistDateKey = (artist: string, date: string) => `${slugify(artist)}|${date}`;
        const knownArtistDates = new Set(
          (existingRows ?? [])
            .filter((r) => r.artist && r.date)
            .map((r) => artistDateKey(r.artist as string, r.date as string)),
        );
        // Segundo cruce, para cuando ni el link ni el nombre del artista
        // coinciden: allevents publica "YEM World Tour" donde Dale Play publica
        // "Morat" (es la gira de su disco Ya Es Mañana). Mismo escenario la misma
        // noche es, en la práctica, el mismo show.
        //
        // Es una regla estricta y a propósito se aplica solo a allevents, que es
        // la fuente menos autoritativa: republica lo que ya venden las ticketeras.
        // Equivocarse cuesta perder un show que solo estaba ahí; no hacerlo cuesta
        // pines duplicados, que es peor para un mapa que se mira de un vistazo.
        const venueDateKey = (venue: string | null, date: string): string | null => {
          const { lat, lng } = findVenueCoords(venue);
          return lat == null || lng == null ? null : `${lat},${lng}|${date}`;
        };
        const knownVenueDates = new Set(
          (existingRows ?? [])
            .map((r) => (r.date ? venueDateKey(r.venue, r.date) : null))
            .filter((k): k is string => k !== null),
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
          found?: number,
        ) {
          // Clasificamos los descartes antes de deduplicar, para poder decir
          // qué se cayó y por qué. Los venues desconocidos además van al log
          // del Worker: son los que hay que agregar a VENUE_COORDS a mano.
          const usable: ConcertRowInsert[] = [];
          const discardedBy: Record<DiscardReason, number> = {
            noTitleOrDate: 0,
            pastDate: 0,
            noCoords: 0,
          };
          const unknownVenues = new Set<string>();
          for (const row of rows) {
            const reason = discardReason(row, today);
            if (!reason) {
              usable.push(row);
              continue;
            }
            discardedBy[reason] += 1;
            if (reason === "noCoords" && row.venue) unknownVenues.add(row.venue);
          }
          if (unknownVenues.size > 0) {
            console.warn(
              `[ingest-concerts] ${sourceKey}: ${unknownVenues.size} venue(s) sin coordenadas, ` +
                `${discardedBy.noCoords} evento(s) perdidos -> ${[...unknownVenues].join(" | ")}`,
            );
          }

          // Ojo: las filas salen sin spotify_artist_id a propósito, y por dos
          // motivos. Uno, resolver los ids acá cuesta una búsqueda por artista y
          // por fuente, sin tope: una corrida normal se comía ~57 subrequests
          // solo en eso y reventaba el techo de 50 de Cloudflare, dejando sin
          // presupuesto a las fuentes que corren últimas y al mail de aviso.
          // Dos, cuando la búsqueda no encontraba al artista escribía null, así
          // que cada corrida le borraba al backfill los ids que ya había
          // resuelto. Al no mandar la columna, el upsert la deja como está y el
          // cron spotify-backfill-daily (06:00 UTC) la completa.
          const kept = dedupeByExternalId(usable);
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
            ...(found !== undefined ? { found } : {}),
            scraped,
            upserted: kept.length,
            discarded: scraped - kept.length,
            ...(skipped ? { skipped } : {}),
            ...(Object.values(discardedBy).some((n) => n > 0) ? { discardedBy } : {}),
            ...(unknownVenues.size > 0 ? { unknownVenues: [...unknownVenues].sort() } : {}),
          };
        }

        // --- allevents.in (fetch directo, cards del listado) -----------------
        try {
          // Los dos listados se solapan casi por completo, pero cada uno trae
          // algun evento que el otro no: se juntan y se deduplica por link.
          const seen = new Set<string>();
          const events: ScrapedEvent[] = [];
          for (const { url: sourceUrl } of ALLEVENTS_SOURCES) {
            const html = await fetchHtml(sourceUrl);
            for (const ev of parseAllEventsListing(html)) {
              if (!ev.buy_url || seen.has(ev.buy_url)) continue;
              seen.add(ev.buy_url);
              events.push(ev);
            }
          }

          const fresh = events.filter((ev) => {
            if (!ev.date) return true;
            if (ev.artist && knownArtistDates.has(artistDateKey(ev.artist, ev.date))) return false;
            const key = venueDateKey(ev.venue, ev.date);
            return !(key && knownVenueDates.has(key));
          });
          const skipped = events.length - fresh.length;

          if (debug) {
            results["allevents"] = {
              found: events.length,
              scraped: fresh.length,
              upserted: 0,
              discarded: 0,
              skipped,
              parsedSample: fresh.slice(0, 5),
            };
          } else {
            const rows = fresh.map((ev) =>
              toRow("allevents", ev.buy_url ?? `${ev.title}:${ev.date}`, ev),
            );
            await upsert("allevents", rows, fresh.length, skipped, events.length);
          }
        } catch (err) {
          console.error("[ingest-concerts] allevents failed", err);
          results["allevents"] = {
            scraped: 0,
            upserted: 0,
            discarded: 0,
            error: err instanceof Error ? err.message : String(err),
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
              found: links.length,
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
            await upsert("allaccess", rows, events.length, skipped, links.length);
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
              found: all.length,
              scraped: all.length,
              upserted: 0,
              discarded: 0,
              skipped: all.length - events.length,
              parsedSample: events.slice(0, 5),
            };
          } else {
            const rows = events.map((ev) => toRow("daleplay", `${ev.buy_url}#${ev.date}`, ev));
            await upsert("daleplay", rows, events.length, all.length - events.length, all.length);
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
          // El total de la lista, antes de quedarnos con Buenos Aires: es lo que
          // dice si la API sigue respondiendo lo que esperamos.
          const listItems = parseTicketekMusicList(listJson);
          const baItems = listItems.filter((i) =>
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
              found: listItems.length,
              scraped: events.length,
              upserted: 0,
              discarded: 0,
              skipped,
              parsedSample: kept.slice(0, 5),
            };
          } else {
            const rows = kept.map((ev) => toRow("ticketek", `${ev.buy_url}#${ev.date}`, ev));
            await upsert(
              "ticketek",
              rows,
              events.length,
              skipped + (events.length - kept.length),
              listItems.length,
            );
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

        // --- livepass.com.ar (listado + JSON-LD por evento) -------------------
        try {
          // El listado solo sirve links: el título viene truncado con puntos
          // suspensivos y no dice ni el lugar ni la provincia. Todo eso está en
          // el JSON-LD de la página de cada evento, así que hay que abrirlas.
          const links = parseLivePassEventLinks(await fetchHtml(LIVEPASS_LISTING));
          const knownLivePassUrls = new Set(
            (existingRows ?? [])
              .filter((r) => r.source === "livepass")
              .map((r) => r.external_id.split("#")[0]),
          );
          const nuevos = links.filter((l) => !knownLivePassUrls.has(l));
          const toFetch = nuevos.slice(0, MAX_LIVEPASS_EVENT_FETCHES);

          const events: ScrapedEvent[] = [];
          let fueraDeZona = 0;
          let noMusicales = 0;
          for (const link of toFetch) {
            try {
              const ev = parseLivePassEventPage(await fetchHtml(link), link);
              if (!ev) continue;
              // Live Pass vende en todo el país y esto es un mapa de Buenos
              // Aires: sin el filtro entran Córdoba, Neuquén y compañía.
              if (!isBuenosAiresRegion(ev.region)) {
                fueraDeZona += 1;
                continue;
              }
              // Y vende de todo, no solo música: su listado mezcla recitales con
              // teatro, ballet y stand-up. Ver pareceNoMusical, que es un colador
              // y no un filtro: algo se va a colar igual.
              if (pareceNoMusical(ev.title)) {
                noMusicales += 1;
                continue;
              }
              events.push(ev);
            } catch (err) {
              console.error(`[ingest-concerts] livepass event ${link} failed`, err);
            }
          }

          // Lo salteado son los links que no se miraron en esta corrida: los que
          // ya estaban más los que quedaron fuera del tope, más los que se
          // abrieron y resultaron ser de otra provincia.
          const skipped = links.length - toFetch.length + fueraDeZona + noMusicales;

          if (debug) {
            results["livepass"] = {
              found: links.length,
              scraped: events.length,
              upserted: 0,
              discarded: 0,
              skipped,
              parsedSample: events.slice(0, 5),
            };
          } else {
            const rows = events.map((ev) => toRow("livepass", `${ev.buy_url}#${ev.date}`, ev));
            await upsert("livepass", rows, events.length, skipped, links.length);
          }
        } catch (err) {
          console.error("[ingest-concerts] livepass failed", err);
          results["livepass"] = {
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

        // Aviso de fuente caída. Va después de todo lo demás por la misma razón
        // que el digest: que un problema mandando mails no voltee una corrida
        // que ya guardó los conciertos.
        //
        // La señal es `found`, no `scraped`. Que una fuente no traiga nada nuevo
        // es lo normal cualquier día tranquilo; que el parser no encuentre NADA
        // en el listado, no: significa que la fuente cambió su HTML o dejó de
        // responder lo que esperábamos.
        let alerta: { fuentes: string[]; sent: boolean; error?: string } | undefined;
        if (!debug) {
          const caidas: FuenteCaida[] = Object.entries(results)
            .filter(([, r]) => r.found === 0 || r.error)
            .map(([source, r]) => ({
              source,
              found: r.found ?? 0,
              ...(r.error ? { error: r.error } : {}),
            }));

          if (caidas.length > 0) {
            const nombres = caidas.map((c) => c.source);
            console.warn(`[ingest-concerts] fuentes sin datos: ${nombres.join(", ")}`);
            const apiKey = process.env.RESEND_API_KEY;
            const to = process.env.ALERT_EMAIL;
            if (!apiKey || !to) {
              alerta = {
                fuentes: nombres,
                sent: false,
                error: !apiKey ? "RESEND_API_KEY not set" : "ALERT_EMAIL not set",
              };
            } else {
              alerta = { fuentes: nombres, ...(await sendIngestAlert(apiKey, to, caidas)) };
            }
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            results,
            ...(digest ? { digest } : {}),
            ...(alerta ? { alerta } : {}),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});
