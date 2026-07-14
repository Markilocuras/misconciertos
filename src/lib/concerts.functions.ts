import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
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

function anonClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
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
      return { concert: null as ConcertRow | null };
    }
    return { concert: (data as ConcertRow | null) ?? null };
  });
