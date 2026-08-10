import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { buildRunIndex } from "@/lib/concert-runs";
import type { Database } from "@/integrations/supabase/types";

export type ConcertRow = {
  id: string;
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
  slug: string | null;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id, source, external_id, title, artist, venue, date, time, price, description, image_url, lat, lng, buy_url, slug, updated_at";

// Los "otros recitales" al pie de cada concierto son solo un link con foto: no
// hace falta traerse la fila entera para renderizarlos.
export type ConcertLinkRow = {
  id: string;
  slug: string | null;
  title: string;
  artist: string | null;
  venue: string | null;
  date: string | null;
  time: string | null;
  image_url: string | null;
};

const LINK_COLUMNS = "id, slug, title, artist, venue, date, time, image_url";

const RELATED_LIMIT = 6;

function anonClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// Query compartida entre el server fn, el sitemap y la agenda (server-side).
export async function fetchUpcomingConcertRows(): Promise<{
  concerts: ConcertRow[];
  error?: string;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await anonClient()
    .from("concerts")
    .select(SELECT_COLUMNS)
    .gte("date", today)
    .neq("source", "seed")
    .order("date", { ascending: true });

  if (error) {
    console.error("[listConcerts] supabase error", error);
    return { concerts: [] as ConcertRow[], error: error.message };
  }
  return { concerts: (data ?? []) as ConcertRow[] };
}

export const listConcerts = createServerFn({ method: "GET" }).handler(() =>
  fetchUpcomingConcertRows(),
);

// Otros conciertos linkeables desde la página de uno: primero los del mismo
// venue (son los que de verdad le sirven a quien está leyendo), después los
// próximos cualesquiera para completar. Existe tanto por el lector como por
// Google: sin esto cada página de concierto es huérfana y solo la conoce el
// sitemap, que es justamente lo que dispara "Descubierta: actualmente sin
// indexar" en Search Console.
async function fetchRelatedConcerts(concert: ConcertRow): Promise<ConcertLinkRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const client = anonClient();

  const baseQuery = () =>
    client
      .from("concerts")
      .select(LINK_COLUMNS)
      .gte("date", today)
      .neq("source", "seed")
      .neq("id", concert.id)
      .not("slug", "is", null)
      .order("date", { ascending: true });

  const [sameVenue, upcoming] = await Promise.all([
    concert.venue
      ? baseQuery().eq("venue", concert.venue).limit(RELATED_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    baseQuery().limit(RELATED_LIMIT * 3),
  ]);

  if (sameVenue.error) console.error("[getConcertBySlug] related venue error", sameVenue.error);
  if (upcoming.error) console.error("[getConcertBySlug] related upcoming error", upcoming.error);

  const related: ConcertLinkRow[] = [];
  const seen = new Set<string>();
  for (const row of [
    ...((sameVenue.data ?? []) as ConcertLinkRow[]),
    ...((upcoming.data ?? []) as ConcertLinkRow[]),
  ]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    related.push(row);
    if (related.length === RELATED_LIMIT) break;
  }
  return related;
}

// Las otras funciones de la misma tanda: mismo artista, mismo venue, fechas
// cercanas. Es lo que deja canonicalizar los cuasi-duplicados hacia una sola
// página y listar ahí todas las fechas. Ver concert-runs.ts.
async function fetchRun(concert: ConcertRow): Promise<ConcertRow[]> {
  if (!concert.artist || !concert.venue || !concert.date || !concert.slug) return [concert];

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await anonClient()
    .from("concerts")
    .select(SELECT_COLUMNS)
    .eq("artist", concert.artist)
    .eq("venue", concert.venue)
    .gte("date", today)
    .neq("source", "seed")
    .not("slug", "is", null)
    .order("date", { ascending: true });

  if (error) {
    console.error("[getConcertBySlug] run error", error);
    return [concert];
  }

  const rows = (data ?? []) as ConcertRow[];
  // Si el show ya pasó no está en la query de arriba, y entonces no es parte de
  // ninguna tanda vigente: se canonicaliza a sí mismo.
  return buildRunIndex(rows).get(concert.id)?.run ?? [concert];
}

export const getConcertBySlug = createServerFn({ method: "GET" })
  .validator((slug: unknown): string => {
    if (typeof slug !== "string" || !/^[a-z0-9-]{1,300}$/.test(slug)) {
      throw new Error("invalid slug");
    }
    return slug;
  })
  .handler(async ({ data: slug }) => {
    const { data, error } = await anonClient()
      .from("concerts")
      .select(SELECT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[getConcertBySlug] supabase error", error);
      return {
        concert: null as ConcertRow | null,
        related: [] as ConcertLinkRow[],
        run: [] as ConcertRow[],
      };
    }
    const concert = (data as ConcertRow | null) ?? null;
    if (!concert) {
      return {
        concert: null as ConcertRow | null,
        related: [] as ConcertLinkRow[],
        run: [] as ConcertRow[],
      };
    }

    const [related, run] = await Promise.all([fetchRelatedConcerts(concert), fetchRun(concert)]);
    return { concert, related, run };
  });
